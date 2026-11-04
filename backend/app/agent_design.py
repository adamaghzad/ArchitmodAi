"""Ground natural-language design instructions in the current metric scene."""

import json
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from shapely.geometry import LineString, Polygon

from .catalog import CATALOG
from .design_knowledge import attach_profile, get_profile
from .geometry import validate_scene
from .inference import InferenceError, structured
from .models import (
    AgentInstructionRequest,
    AgentOperation,
    InstructionIntent,
    OperationAdvice,
    ProductAdvice,
    Scene,
    ValidationReport,
)
from .operations import apply_operations
from .repair import repair_candidate
from .style_ranking import rank_products, semantic_scores


class InstructionState(TypedDict, total=False):
    scene: Scene
    request: AgentInstructionRequest
    intent: InstructionIntent
    products: dict[str, list[str]]
    operations: list[AgentOperation]
    candidate: Scene
    report: ValidationReport
    explanation: str


def interpret(state: InstructionState):
    scene, request = state["scene"], state["request"]
    intent = structured(
        "requirements",
        InstructionIntent,
        "Interpret this instruction against the supplied EXISTING scene. Return only existing room/object IDs. "
        "An explicit room_id/object_id restricts your target. A total cost limit is the whole project budget in MAD. "
        "Use replace_furniture for specific objects, replace_room_furniture for an entire room, "
        "place_furniture for additions, change_material for stored finishes, edit_objects for geometry edits. "
        "Do not invent coordinates, products or room IDs. Leave style/budget null unless requested.",
        json.dumps(
            {
                "instruction": request.instruction,
                "scope_room_id": request.room_id,
                "scope_object_id": request.object_id,
                "style_profile": get_profile(scene.style).context(
                    next(
                        (room.type for room in scene.rooms if room.id == request.room_id),
                        scene.rooms[0].type,
                    )
                )
                if get_profile(scene.style)
                else None,
                "scene": scene.model_dump(),
            }
        ),
    )
    rooms = {room.id for room in scene.rooms}
    if not set(intent.room_ids) <= rooms or (
        request.room_id and set(intent.room_ids) != {request.room_id}
    ):
        raise InferenceError("The instruction targets rooms outside the allowed scene scope.")
    furniture = {item.id: item for item in scene.furniture}
    for object_id in intent.object_ids:
        if object_id not in furniture or furniture[object_id].room_id not in intent.room_ids:
            if intent.action != "edit_objects":
                raise InferenceError(
                    "The instruction refers to an unknown or out-of-scope furniture object."
                )
    if request.object_id:
        item = furniture.get(request.object_id)
        if (
            item is None
            or intent.action != "replace_furniture"
            or set(intent.object_ids) != {item.id}
        ):
            raise InferenceError(
                "This instruction is restricted to replacing the selected furniture object."
            )
    if intent.action == "replace_furniture" and not intent.object_ids:
        raise InferenceError("Select or identify an existing furniture item to replace.")
    return {"intent": intent}


def retrieve(state: InstructionState):
    scene, intent = state["scene"], state["intent"]
    staged = scene.model_copy(deep=True)
    if intent.style:
        staged.style = intent.style
    if intent.budget_mad is not None:
        staged.budget_mad = intent.budget_mad
    staged.furniture = [
        item
        for item in staged.furniture
        if not (
            intent.action == "replace_room_furniture"
            and item.room_id in intent.room_ids
            or intent.action == "replace_furniture"
            and item.id in intent.object_ids
        )
    ]
    if intent.action == "change_material":
        staged.materials = [
            item for item in staged.materials if item.room_id not in intent.room_ids
        ]
    pools = {}
    for room in scene.rooms:
        if room.id not in intent.room_ids:
            continue
        scores, _ = semantic_scores(staged, room, True)
        pools[room.id] = [row["product_id"] for row in rank_products(staged, room, semantic=scores)]
    return {"products": pools}


def allowed_operation(operation: AgentOperation, scene: Scene, state: InstructionState):
    room_ids = set(state["intent"].room_ids)
    walls = {
        wall.id
        for wall in scene.walls
        if any(
            Polygon(room.polygon).boundary.buffer(0.002).covers(LineString([wall.start, wall.end]))
            for room in scene.rooms
            if room.id in room_ids
        )
    }
    objects = {item.id for item in scene.furniture if item.room_id in room_ids}
    objects.update(room_ids)
    objects.update(walls)
    objects.update(opening.id for opening in scene.openings if opening.wall_id in walls)
    # Architecture edits of shared walls affect adjacent rooms as well; require
    # all adjoining rooms to be explicitly in the instruction's scope.
    if operation.type == "update_wall" and operation.object_id in walls:
        wall = next(wall for wall in scene.walls if wall.id == operation.object_id)
        if any(
            room.id not in room_ids
            and Polygon(room.polygon)
            .boundary.buffer(0.002)
            .covers(LineString([wall.start, wall.end]))
            for room in scene.rooms
        ):
            raise InferenceError("Editing a shared wall requires both adjoining rooms in scope.")
    if operation.type != "place_furniture" and operation.object_id not in objects:
        raise InferenceError("Agent operation targets an unknown or unauthorized object.")
    if operation.room_id and operation.room_id not in room_ids:
        raise InferenceError("Agent operation targets a room outside the instruction scope.")
    pool = {product_id for ids in state["products"].values() for product_id in ids}
    if operation.product_id and operation.product_id not in pool:
        raise InferenceError("Agent operation uses a product outside the retrieved catalogue.")


def propose(state: InstructionState):
    original, intent = state["scene"], state["intent"]
    candidate = original.model_copy(deep=True)
    if intent.budget_mad is not None:
        candidate.budget_mad = intent.budget_mad
    if intent.style:
        candidate.style = intent.style
        attach_profile(candidate)
    operations = []
    explanations = [intent.explanation]
    if intent.action == "edit_objects":
        advice = structured(
            "design",
            OperationAdvice,
            "Propose typed operations only for the supplied scene and scoped rooms. Keep stable object IDs. "
            "Wall endpoints and opening offsets are metres; furniture rotation is around its footprint origin. "
            "Do not execute code or alter prices, budgets or catalogue records. Shared wall edits require both rooms in scope.",
            json.dumps(
                {
                    "instruction": state["request"].instruction,
                    "scene": candidate.model_dump(),
                    "room_ids": intent.room_ids,
                    "catalogue_ids": state["products"],
                }
            ),
        )
        for operation in advice.operations:
            allowed_operation(operation, original, state)
        candidate = apply_operations(candidate, advice.operations)
        operations = advice.operations
        explanations.append(advice.explanation)
    else:
        if intent.action == "replace_room_furniture":
            operations = [
                AgentOperation(type="remove_furniture", object_id=item.id)
                for item in candidate.furniture
                if item.room_id in intent.room_ids
            ]
            candidate = apply_operations(candidate, operations)
        for room_id in intent.room_ids:
            targets = [
                item
                for item in candidate.furniture
                if item.id in intent.object_ids and item.room_id == room_id
            ]
            batches = targets if intent.action == "replace_furniture" else [None]
            for target in batches:
                pool = [
                    CATALOG[pid]
                    for pid in state["products"][room_id]
                    if CATALOG[pid].kind
                    == ("material" if intent.action == "change_material" else "furniture")
                    and (
                        target is None
                        or CATALOG[pid].category == CATALOG[target.product_id].category
                    )
                ]
                remaining = candidate.budget_mad - validate_scene(candidate).total_mad
                if target:
                    remaining += CATALOG[target.product_id].price_mad
                pool = [product for product in pool if product.price_mad <= remaining]
                if not pool:
                    raise ValueError(
                        "No stored products match the requested style, room dimensions and remaining project budget."
                    )
                room = next(room for room in candidate.rooms if room.id == room_id)
                advice = structured(
                    "materials" if intent.action == "change_material" else "furniture",
                    ProductAdvice,
                    "Select a coherent set of supplied product IDs matching the instruction and actual room. "
                    "Return one explanation per ID. Respect the remaining total MAD budget. "
                    "For a specific replacement return exactly one product. Never invent products or prices.",
                    json.dumps(
                        {
                            "instruction": state["request"].instruction,
                            "room": room.model_dump(),
                            "style_profile": get_profile(candidate.style).context(room.type)
                            if get_profile(candidate.style)
                            else None,
                            "available_budget_mad": remaining,
                            "replace_id": target.id if target else None,
                            "existing_furniture": [
                                item.model_dump()
                                for item in candidate.furniture
                                if item.room_id == room_id
                            ],
                            "products": [
                                product.model_dump(
                                    include={
                                        "id",
                                        "name",
                                        "category",
                                        "width_m",
                                        "depth_m",
                                        "height_m",
                                        "price_mad",
                                        "design_style",
                                        "material",
                                    }
                                )
                                for product in pool
                            ],
                        }
                    ),
                )
                permitted = {product.id for product in pool}
                if (
                    not advice.product_ids
                    or len(advice.product_ids) != len(advice.explanations)
                    or len(set(advice.product_ids)) != len(advice.product_ids)
                    or not set(advice.product_ids) <= permitted
                    or (target is not None and len(advice.product_ids) != 1)
                ):
                    raise InferenceError(
                        "The agent returned an unsupported product selection. No changes were saved."
                    )
                for product_id, explanation in zip(
                    advice.product_ids, advice.explanations, strict=True
                ):
                    product = CATALOG[product_id]
                    operation = AgentOperation(
                        type="change_material"
                        if product.kind == "material"
                        else "replace_furniture"
                        if target
                        else "place_furniture",
                        object_id=target.id
                        if target
                        else room_id
                        if product.kind == "material"
                        else "",
                        product_id=product_id,
                        room_id=room_id,
                        surface=("floor" if product.category == "flooring" else "walls")
                        if product.kind == "material"
                        else None,
                    )
                    before_ids = {item.id for item in candidate.furniture}
                    updated = apply_operations(candidate, [operation])
                    if validate_scene(updated).total_mad > updated.budget_mad:
                        raise ValueError(
                            "The selected products exceed the requested total project budget. No proposal was saved."
                        )
                    if product.kind == "furniture":
                        placed = next(
                            item
                            for item in updated.furniture
                            if item.id == (target.id if target else "") or item.id not in before_ids
                        )
                        operation.object_id = placed.id
                        operation.position, operation.rotation_deg = (
                            placed.position,
                            placed.rotation_deg,
                        )
                    operations.append(operation)
                    candidate = updated
                    explanations.append(explanation)
    if not operations:
        raise ValueError("The instruction produced no scene modifications.")
    return {"candidate": candidate, "operations": operations, "explanation": " ".join(explanations)}


def check_and_correct(state: InstructionState):
    candidate = state["candidate"]
    report = validate_scene(candidate)
    operations = list(state["operations"])
    explanation = state["explanation"]
    if not report.valid:
        allowed = {
            item.id for item in candidate.furniture if item.room_id in state["intent"].room_ids
        }
        if state["request"].object_id:
            allowed.intersection_update({state["request"].object_id})
        try:
            corrected = repair_candidate(candidate, allowed)
            for item in corrected.furniture:
                old = next(old for old in candidate.furniture if old.id == item.id)
                if (old.position, old.rotation_deg) != (item.position, item.rotation_deg):
                    operations.append(
                        AgentOperation(
                            type="move_furniture",
                            object_id=item.id,
                            position=item.position,
                            rotation_deg=item.rotation_deg,
                        )
                    )
            candidate = corrected
            report = validate_scene(candidate)
        except (ValueError, InferenceError) as exc:
            explanation += f" Correction unresolved: {exc}"
    return {
        "candidate": candidate,
        "report": report,
        "operations": operations,
        "explanation": explanation,
    }


graph = StateGraph(InstructionState)
graph.add_node("interpret_instruction", interpret)
graph.add_node("retrieve_catalogue", retrieve)
graph.add_node("propose_operations", propose)
graph.add_node("validate_and_correct", check_and_correct)
graph.add_edge(START, "interpret_instruction")
graph.add_edge("interpret_instruction", "retrieve_catalogue")
graph.add_edge("retrieve_catalogue", "propose_operations")
graph.add_edge("propose_operations", "validate_and_correct")
graph.add_edge("validate_and_correct", END)
instruction_workflow = graph.compile()
