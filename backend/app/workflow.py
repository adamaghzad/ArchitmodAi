import json
from typing import NotRequired, TypedDict

from langgraph.graph import END, START, StateGraph
from shapely.geometry import Polygon

from .catalog import CATALOG, PRODUCTS, total_cost
from .geometry import validate_scene
from .inference import InferenceError, structured
from .marketplace import position_for
from .materials import material_cost
from .models import ProductAdvice, Scene, ValidationReport


class DesignState(TypedDict):
    scene: Scene
    report: ValidationReport
    use_ai: NotRequired[bool]
    choices: NotRequired[dict[str, list[str]]]


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


def choose_products(state: DesignState):
    if not state.get("use_ai"):
        return {"choices": {}}
    scene = state["scene"]
    choices = {}
    for room in scene.rooms:
        bounds = Polygon(room.polygon).bounds
        pool = [
            product
            for product in PRODUCTS
            if product.kind == "furniture"
            and room.type in product.room_types
            and product.price_mad <= scene.budget_mad
        ]
        advice = structured(
            "furniture",
            ProductAdvice,
            "Select a coherent furniture set from these catalogue IDs for the room. Prioritize essential furniture, dimension fit and the shared project budget. Return only supplied IDs and one explanation per ID. Coordinates will be solved deterministically. Do not invent products or prices.",
            json.dumps(
                {
                    "room": room.model_dump(),
                    "room_size_m": [bounds[2] - bounds[0], bounds[3] - bounds[1]],
                    "style": scene.style,
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
            raise InferenceError(
                "The furniture agent returned unsupported products. No proposal was saved."
            )
        choices[room.id] = list(dict.fromkeys(advice.product_ids))
    return {"choices": choices}


def place_furniture(state: DesignState):
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
    return {"report": validate_scene(state["scene"])}


graph = StateGraph(DesignState)
graph.add_node("furniture_agent", choose_products)
graph.add_node("catalogue_placement", place_furniture)
graph.add_node("geometry_validation", check_design)
graph.add_edge(START, "furniture_agent")
graph.add_edge("furniture_agent", "catalogue_placement")
graph.add_edge("catalogue_placement", "geometry_validation")
graph.add_edge("geometry_validation", END)
design_workflow = graph.compile()
