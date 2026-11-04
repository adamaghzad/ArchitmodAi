import json
from typing import TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph
from shapely.geometry import Polygon

from .catalog import CATALOG, Product, search_products
from .design_knowledge import get_profile
from .geometry import validate_scene
from .inference import InferenceError, structured
from .marketplace import position_for
from .materials import material_selection
from .models import ProductAdvice, Recommendation, Scene
from .style_ranking import rank_products, semantic_scores


class RecommendationState(TypedDict):
    scene: Scene
    room_id: str | None
    use_ai: bool
    recommendations: list[Recommendation]


def recommendations_for(state: RecommendationState, kind: str):
    scene = state["scene"]
    remaining = max(0, scene.budget_mad - validate_scene(scene).total_mad)
    suggestions = list(state.get("recommendations", []))
    for room in scene.rooms:
        if state["room_id"] and room.id != state["room_id"]:
            continue
        x0, y0, x1, y1 = Polygon(room.polygon).bounds
        pool = search_products(
            kind=kind,
            room_type=room.type,
            max_price=remaining,
            width=x1 - x0 - 0.4,
            depth=y1 - y0 - 0.4,
        )
        semantic, retrieval = semantic_scores(scene, room, state["use_ai"])
        ranked = rank_products(scene, room, pool, semantic)
        order = {row["product_id"]: i for i, row in enumerate(ranked)}
        pool = sorted(
            [product for product in pool if product.id in order],
            key=lambda product: order[product.id],
        )
        eligible: list[Product] = []
        for product in pool:
            if kind == "furniture":
                if position_for(scene, product, room.id) is None:
                    continue
            else:
                surface = "floor" if product.category == "flooring" else "walls"
                selection = material_selection(scene, product, room.id, surface)
                if selection.units * product.price_mad > remaining:
                    continue
            eligible.append(product)
            if len(eligible) == 8:
                break
        reasons = {}
        chosen = eligible[:2]
        if state["use_ai"] and eligible:
            advice = structured(
                "furniture" if kind == "furniture" else "materials",
                ProductAdvice,
                "Recommend at most two products from the supplied candidate IDs only. Explain room, style, dimensions and budget using the provided facts. Do not invent prices, stock, URLs or product attributes.",
                json.dumps(
                    {
                        "room": room.model_dump(),
                        "style": scene.style,
                        "style_profile": get_profile(scene.style).context(room.type)
                        if get_profile(scene.style)
                        else None,
                        "semantic_retrieval": retrieval,
                        "remaining_budget_mad": remaining,
                        "candidates": [product.model_dump() for product in eligible],
                    }
                ),
            )
            allowed = {product.id for product in eligible}
            if len(advice.product_ids) != len(advice.explanations) or any(
                product_id not in allowed for product_id in advice.product_ids
            ):
                raise InferenceError(
                    "The agent recommended unsupported products. No suggestions were saved."
                )
            chosen = [CATALOG[product_id] for product_id in dict.fromkeys(advice.product_ids)][:2]
            reasons = dict(zip(advice.product_ids, advice.explanations, strict=True))
        for product in chosen:
            surface = (
                ("floor" if product.category == "flooring" else "walls")
                if kind == "material"
                else None
            )
            selection = material_selection(scene, product, room.id, surface) if surface else None
            subtotal = selection.units * product.price_mad if selection else product.price_mad
            facts = f"Fits {room.name}; {product.design_style}; {product.width_m} × {product.depth_m} m; {'quantity ' + str(selection.units) + '; ' if selection else ''}{subtotal:.0f} MAD sample estimate within remaining budget {remaining:.0f} MAD."
            suggestions.append(
                Recommendation(
                    id=f"suggestion_{uuid4().hex[:12]}",
                    product_id=product.id,
                    room_id=room.id,
                    surface=surface,
                    mock_data=product.mock_data,
                    reason=(reasons.get(product.id, "") + " " + facts).strip(),
                )
            )
    return {"recommendations": suggestions}


graph = StateGraph(RecommendationState)
graph.add_node("furniture_agent", lambda state: recommendations_for(state, "furniture"))
graph.add_node("materials_agent", lambda state: recommendations_for(state, "material"))
graph.add_edge(START, "furniture_agent")
graph.add_edge("furniture_agent", "materials_agent")
graph.add_edge("materials_agent", END)
recommendation_workflow = graph.compile()
