"""Explainable soft ranking after metric, room-use and price eligibility filters."""

import math
import os
from functools import lru_cache

from shapely.geometry import Polygon

from .catalog import CATALOG, PRODUCTS, catalogue_vectors, description, fits, total_cost
from .design_knowledge import get_profile, surface_preferences
from .inference import InferenceError, embed_texts
from .materials import material_cost, material_selection
from .settings import model_for, ollama_url

WEIGHTS = {"style": 0.45, "dimensions": 0.20, "budget": 0.15, "semantic": 0.20}


@lru_cache(maxsize=128)
def query_vector(endpoint, model, query):
    return embed_texts([query])[0]


def cosine(a, b):
    if len(a) != len(b) or not a or not all(math.isfinite(value) for value in [*a, *b]):
        raise ValueError("Embedding dimensions or values do not match")
    norm = math.sqrt(sum(x * x for x in a) * sum(x * x for x in b))
    return max(-1, min(1, sum(x * y for x, y in zip(a, b, strict=True)) / norm)) if norm else 0


def semantic_scores(scene, room, enabled):
    profile = get_profile(scene.style)
    model = model_for("embedding")
    if not enabled or os.getenv("ARCHAI_EMBEDDINGS_ENABLED", "true").lower() == "false":
        return {}, {
            "status": "disabled",
            "model": model,
            "reason": "Deterministic/offline ranking requested; semantic score omitted.",
        }
    query = f"{profile.name if profile else scene.style} {room.type}. "
    if profile:
        query += "; ".join([*profile.preferred_materials, *profile.design_characteristics])
    if scene.design_brief:
        query += ". User requirements: " + scene.design_brief.prompt
    # Reuse the existing corpus cache and inference lock. One room query serves
    # every role; never reload EmbeddingGemma for each placement candidate.
    texts = tuple(description(product) for product in PRODUCTS)
    try:
        vectors = catalogue_vectors(ollama_url(), model, texts)
        query_values = query_vector(ollama_url(), model, query)
        values = {
            product.id: (cosine(vector, query_values) + 1) / 2
            for product, vector in zip(PRODUCTS, vectors, strict=True)
        }
        return values, {"status": "used", "model": model, "dimensions": len(query_values)}
    except (InferenceError, ValueError, TypeError) as exc:
        return {}, {
            "status": "fallback",
            "model": model,
            "reason": str(exc),
            "fallback": "Style, dimensions and budget; no model download.",
        }


def rank_products(scene, room, candidates=None, semantic=None):
    profile = get_profile(scene.style)
    bounds = Polygon(room.polygon).bounds
    margin = max((wall.thickness / 2 for wall in scene.walls), default=0.075) + 0.06
    width, depth = bounds[2] - bounds[0] - 2 * margin, bounds[3] - bounds[1] - 2 * margin
    remaining = max(
        0,
        scene.budget_mad
        - total_cost([item for item in scene.furniture if item.product_id in CATALOG])
        - material_cost(scene),
    )
    ranked = []
    for product in PRODUCTS if candidates is None else candidates:
        if room.type not in product.room_types or not fits(product, width, depth):
            continue
        if product.kind == "material":
            surface = "floor" if product.category == "flooring" else "walls"
            if room.type == "bathroom" and surface == "floor" and product.material != "ceramic":
                continue
            cost = material_selection(scene, product, room.id, surface).units * product.price_mad
        else:
            cost = product.price_mad
        if cost > remaining:
            continue
        style_score = 0.0
        if profile:
            tag = get_profile(product.design_style)
            exact = float(tag is not None and tag.id == profile.id)
            material = float(
                any(word in product.material.lower() for word in profile.preferred_materials)
            )
            affinity = profile.catalogue_affinities.get(product.id, 0.3)
            style_score = 0.35 * exact + 0.20 * material + 0.45 * affinity
            if product.kind == "material":
                preferences = surface_preferences(profile, room.type, surface)
                if product.id in preferences:
                    style_score = min(
                        1,
                        0.8
                        + 0.2
                        * (len(preferences) - preferences.index(product.id))
                        / len(preferences),
                    )
        components = {
            "style": style_score,
            "dimensions": 1 - min(1, product.width_m * product.depth_m / max(0.001, width * depth))
            if product.kind == "furniture"
            else 1,
            "budget": 1 - cost / max(1, remaining),
            "semantic": (semantic or {}).get(product.id, 0),
        }
        active = {key: value for key, value in WEIGHTS.items() if key != "semantic" or semantic}
        score = sum(components[key] * weight for key, weight in active.items()) / sum(
            active.values()
        )
        ranked.append(
            {
                "product_id": product.id,
                "score": round(score, 6),
                "components": {key: round(value, 6) for key, value in components.items()},
                "estimated_mad": cost,
            }
        )
    return sorted(ranked, key=lambda item: (-item["score"], item["product_id"]))
