import json

from .catalog import CATALOG
from .geometry import validate_scene
from .inference import InferenceError, structured
from .models import RepairAdvice, Scene


def repair_candidate(scene: Scene, allowed_object_ids: set[str] | None = None) -> Scene:
    candidate = scene.model_copy(deep=True)
    for _attempt in range(3):
        report = validate_scene(candidate)
        if report.valid:
            return candidate
        advice = structured(
            "correction",
            RepairAdvice,
            "Propose small furniture moves that resolve the supplied geometry errors. Use existing furniture object IDs only. Coordinates are metres and rotation is around each footprint origin. Never change room geometry, budget, prices, or catalogue IDs.",
            json.dumps(
                {
                    "scene": candidate.model_dump(),
                    "catalogue": [
                        CATALOG[item.product_id].model_dump()
                        for item in candidate.furniture
                        if item.product_id in CATALOG
                    ],
                    "errors": [
                        issue.model_dump() for issue in report.issues if issue.severity == "error"
                    ],
                    "allowed_object_ids": sorted(allowed_object_ids)
                    if allowed_object_ids is not None
                    else [item.id for item in candidate.furniture],
                }
            ),
        )
        allowed = {
            item.id: item
            for item in candidate.furniture
            if allowed_object_ids is None or item.id in allowed_object_ids
        }
        if any(move.object_id not in allowed for move in advice.moves):
            raise InferenceError(
                "Correction agent proposed an unknown object. No changes were saved."
            )
        for move in advice.moves:
            allowed[move.object_id].position = move.position
            allowed[move.object_id].rotation_deg = move.rotation_deg
    if validate_scene(candidate).valid:
        return candidate
    raise ValueError(
        "The correction agent could not produce a valid draft in three attempts. No changes were saved; adjust the plan manually."
    )
