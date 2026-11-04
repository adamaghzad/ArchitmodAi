import json
from typing import NotRequired, TypedDict

from langgraph.graph import END, START, StateGraph
from shapely.geometry import Polygon

from .catalog import CATALOG, PRODUCTS, total_cost
from .completeness import trace
from .design_knowledge import attach_profile, get_profile
from .furnishing_solver import place_requested
from .geometry import validate_scene
from .inference import InferenceError, structured
from .interior_brief import requests_for
from .marketplace import position_for
from .materials import material_cost, material_selection
from .models import ProductAdvice, Scene, ValidationReport
from .style_ranking import rank_products, semantic_scores


class DesignState(TypedDict):
    scene: Scene
    report: ValidationReport
    use_ai: NotRequired[bool]
    choices: NotRequired[dict[str, list[str]]]
    attempt: NotRequired[int]
    use_semantic: NotRequired[bool]
    rankings: NotRequired[dict]


PRIMARY = {
    "living": "sofa",
    "bedroom": "bed",
    "kitchen": "storage",
    "bathroom": "vanity",
    "office": "desk",
}
EXTRAS = {
    "living": ["table", "lighting", "chair", "rug"],
    "bedroom": ["table", "lighting", "storage"],
    "kitchen": ["table", "chair"],
    "bathroom": [],
    "office": ["chair", "storage", "lighting"],
}


def infer_or_fallback(scene, role, schema, system, prompt):
    try:
        return structured(role, schema, system, prompt)
    except InferenceError as exc:
        if not requests_for(scene):
            raise
        trace(
            scene,
            role,
            status="agent_fallback",
            reason=str(exc),
            strategy="Stored catalogue matching and bounded geometry solver; original requirements retained.",
        )
        return ProductAdvice(product_ids=[], explanations=[])


def choose_products(state: DesignState):
    scene = state["scene"].model_copy(deep=True)
    profile = attach_profile(scene)
    for key, room, need in requests_for(scene):
        trace(
            scene,
            "requirements",
            requirement_id=key,
            room_id=room.id,
            requested=need.name,
            quantity=need.quantity,
            priority=need.priority,
        )
    choices = {}
    rankings = {}
    for room in scene.rooms:
        scores, semantic = semantic_scores(scene, room, state.get("use_semantic", True))
        ranked = rank_products(scene, room, semantic=scores)
        rankings[room.id] = {"products": ranked, "semantic": semantic}
        choices[room.id] = [row["product_id"] for row in ranked]
        trace(
            scene,
            "profile_retrieval",
            room_id=room.id,
            room_type=room.type,
            profile_id=profile.id if profile else None,
            profile_revision=profile.revision if profile else None,
            semantic=semantic,
            ranking=ranked,
        )
        if not state.get("use_ai"):
            continue
        bounds = Polygon(room.polygon).bounds
        pool = [
            product
            for product in PRODUCTS
            if product.kind == "furniture"
            and room.type in product.room_types
            and product.price_mad <= scene.budget_mad
            and product.id in choices[room.id]
        ]
        pool.sort(key=lambda p: choices[room.id].index(p.id))
        pool = pool[:20]
        advice = infer_or_fallback(
            scene,
            "furniture",
            ProductAdvice,
            "Select a coherent furniture set from these catalogue IDs for the room. Prioritize essential furniture, dimension fit and the shared project budget. Return only supplied IDs and one explanation per ID. Coordinates will be solved deterministically. Do not invent products or prices.",
            json.dumps(
                {
                    "room": room.model_dump(),
                    "room_size_m": [bounds[2] - bounds[0], bounds[3] - bounds[1]],
                    "style": scene.style,
                    "style_profile": profile.context(room.type) if profile else None,
                    "original_brief": {
                        "prompt": scene.design_brief.prompt,
                        "needs": [
                            {"role": need.role, "quantity": need.quantity, "origin": need.origin}
                            for _, r, need in requests_for(scene)
                            if r.id == room.id
                        ],
                    }
                    if scene.design_brief
                    else None,
                    "project_budget_mad": scene.budget_mad,
                    "existing_furniture": [
                        item.model_dump() for item in scene.furniture if item.room_id == room.id
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
        allowed = {product.id for product in pool}
        if len(advice.product_ids) != len(advice.explanations) or any(
            product_id not in allowed for product_id in advice.product_ids
        ):
            if not requests_for(scene):
                raise InferenceError(
                    "The furniture agent returned unsupported products. No proposal was saved."
                )
            trace(
                scene,
                "selection",
                room_id=room.id,
                status="agent_fallback",
                reason="Agent returned unsupported IDs or unmatched explanations; original requirement slots use stored catalogue alternatives.",
            )
            advice = ProductAdvice(
                product_ids=[key for key in advice.product_ids if key in allowed], explanations=[]
            )
        # Agent advice is a modest soft preference, never a restriction on the
        # original quantities or on otherwise feasible catalogue alternatives.
        adjusted = sorted(
            ranked,
            key=lambda row: -(row["score"] + 0.03 * (row["product_id"] in advice.product_ids)),
        )
        choices[room.id] = [row["product_id"] for row in adjusted]
        trace(
            scene,
            "selection",
            room_id=room.id,
            product_ids=choices[room.id],
            status="ranked",
            quantity_source="original requirements, not unique product IDs",
        )
    return {"scene": scene, "choices": choices, "rankings": rankings}


def place_furniture(state: DesignState):
    if requests_for(state["scene"]):
        scene = place_requested(state["scene"], state.get("choices", {}), state.get("attempt", 0))
        if state.get("use_ai"):
            scene.notes = [note for note in scene.notes if not note.startswith("AI furnishing:")]
            scene.notes.append(
                f"AI furnishing: {len(scene.furniture) - len(state['scene'].furniture)} additional catalogue items; profile preferences, user quantities, geometry and budget checked. Review the candidate."
            )
        return {"scene": scene}
    scene = state["scene"].model_copy(deep=True)
    initial_count = len(scene.furniture)

    def place(room, products):
        for product in products:
            if product.kind != "furniture" or room.type not in product.room_types:
                continue
            if (
                total_cost(scene.furniture) + material_cost(scene) + product.price_mad
                > scene.budget_mad
            ):
                continue
            item = position_for(scene, product, room.id)
            if item:
                scene.furniture.append(item)
                return True
        return False

    if state.get("use_ai"):
        for room in scene.rooms:
            for product_id in state.get("choices", {}).get(room.id, []):
                if not any(
                    item.product_id == product_id and item.room_id == room.id
                    for item in scene.furniture
                ):
                    place(room, [CATALOG[product_id]])
    else:

        def category(room, name):
            if any(
                CATALOG[item.product_id].category == name and item.room_id == room.id
                for item in scene.furniture
            ):
                return
            products = sorted(
                [product for product in PRODUCTS if product.category == name],
                key=lambda product: product.design_style != scene.style,
            )
            place(room, products)

        # Essential items in every room precede optional pieces in any one room.
        for room in scene.rooms:
            category(room, PRIMARY[room.type])
        for room in scene.rooms:
            if room.type == "bathroom":
                for name in ("toilet", "shower"):
                    category(room, name)
        for room in scene.rooms:
            for name in EXTRAS[room.type]:
                category(room, name)
    count = len(scene.furniture) - initial_count
    if state.get("use_ai"):
        scene.notes = [note for note in scene.notes if not note.startswith("AI furnishing:")]
        scene.notes.append(
            f"AI furnishing: {count} additional stored catalogue items placed after space, door and budget checks. Review the candidate before approval."
        )
    return {"scene": scene}


def check_design(state: DesignState):
    report = validate_scene(state["scene"])
    if report.completeness:
        for row in report.completeness.items:
            trace(
                state["scene"],
                "validation",
                requirement_id=row.requirement_id,
                object_ids=row.object_ids,
                status=row.validation_status,
                requested=row.requested,
                placed=row.placed,
                rendering_status="awaiting_viewport_audit",
            )
    return {"report": report}


def apply_materials(state: DesignState):
    scene = state["scene"].model_copy(deep=True)
    profile = get_profile(scene.style)
    if not profile:
        return {"scene": scene}
    for room in scene.rooms:
        # Reuse the room's semantic scores, then recompute real purchase-unit
        # costs against the budget remaining after essential furniture.
        semantic = {
            row["product_id"]: row["components"]["semantic"]
            for row in state.get("rankings", {}).get(room.id, {}).get("products", [])
            if state.get("rankings", {}).get(room.id, {}).get("semantic", {}).get("status")
            == "used"
        }
        ranked = rank_products(scene, room, [p for p in PRODUCTS if p.kind == "material"], semantic)
        pool = [CATALOG[row["product_id"]] for row in ranked]
        selected_ids = []
        if pool and state.get("use_ai") and not state.get("attempt", 0):
            advice = infer_or_fallback(
                scene,
                "materials",
                ProductAdvice,
                "Select one floor and one wall finish from supplied IDs, guided by the retrieved style profile and the user's explicit material preferences. Style is a preference; room compatibility and the remaining budget are authoritative. Never invent products or prices.",
                json.dumps(
                    {
                        "brief": scene.design_brief.model_dump() if scene.design_brief else None,
                        "style_profile": profile.context(room.type),
                        "products": [
                            {
                                "id": p.id,
                                "category": p.category,
                                "material": p.material,
                                "color": p.color,
                                "price_mad": p.price_mad,
                            }
                            for p in pool[:12]
                        ],
                    }
                ),
            )
            allowed = {p.id for p in pool[:12]}
            selected_ids = [key for key in advice.product_ids if key in allowed]
            if set(advice.product_ids) - allowed:
                trace(
                    scene,
                    "materials",
                    room_id=room.id,
                    status="agent_fallback",
                    reason="Agent returned unsupported finish IDs; using eligible ranked alternatives.",
                )
        for surface in ["floor", "walls"]:
            if any(
                selection.room_id == room.id and selection.surface == surface
                for selection in scene.materials
            ):
                continue
            candidates = [p for p in pool if (p.category == "flooring") == (surface == "floor")]
            candidates = [
                p
                for p in candidates
                if total_cost(scene.furniture)
                + material_cost(scene)
                + material_selection(scene, p, room.id, surface).units * p.price_mad
                <= scene.budget_mad
            ]
            candidates.sort(key=lambda p: p.id not in selected_ids)
            palette = set(scene.design_brief.palette if scene.design_brief else [])
            explicit_id = (
                "pastel_oak_floor"
                if surface == "floor" and "light oak" in palette
                else "warm_paint"
                if surface == "walls" and "warm cream" in palette
                else None
            )
            if explicit_id:
                candidates.sort(key=lambda p: p.id != explicit_id)
            if not candidates:
                trace(
                    scene,
                    "materials",
                    room_id=room.id,
                    surface=surface,
                    status="missing",
                    reason="No room-compatible finish fits remaining purchase-unit budget.",
                )
                continue
            product = candidates[0]
            selection = material_selection(scene, product, room.id, surface)
            cost = selection.units * product.price_mad
            within_budget = (
                total_cost(scene.furniture) + material_cost(scene) + cost <= scene.budget_mad
            )
            if within_budget:
                scene.materials.append(selection)
                if surface == "floor":
                    room.color = product.color
            trace(
                scene,
                "materials",
                room_id=room.id,
                product_id=product.id,
                surface=surface,
                units=selection.units,
                subtotal_mad=cost,
                status="applied" if within_budget else "missing",
                reason=None
                if within_budget
                else "Finish quantities exceed remaining budget; valid furniture preserved.",
            )
    return {"scene": scene}


def correction(state: DesignState):
    return {"attempt": state.get("attempt", 0) + 1}


def route_completion(state: DesignState):
    report = state["report"].completeness
    if (
        report
        and any(
            row.placed < row.requested and (row.origin == "user" or row.priority == "essential")
            for row in report.items
        )
        and state.get("attempt", 0) < 2
    ):
        return "bounded_correction"
    return END


graph = StateGraph(DesignState)
graph.add_node("furniture_agent", choose_products)
graph.add_node("catalogue_placement", place_furniture)
graph.add_node("geometry_validation", check_design)
graph.add_node("materials_agent", apply_materials)
graph.add_node("bounded_correction", correction)
graph.add_edge(START, "furniture_agent")
graph.add_edge("furniture_agent", "catalogue_placement")
graph.add_edge("catalogue_placement", "materials_agent")
graph.add_edge("materials_agent", "geometry_validation")
graph.add_conditional_edges(
    "geometry_validation", route_completion, {"bounded_correction": "bounded_correction", END: END}
)
graph.add_edge("bounded_correction", "catalogue_placement")
design_workflow = graph.compile()
