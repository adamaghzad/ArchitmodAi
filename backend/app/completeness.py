"""Requirement accounting derived from the current canonical scene, never a stale count."""

import json
import logging

from .catalog import CATALOG
from .design_knowledge import get_profile
from .interior_brief import matches_role, requests_for
from .models import CompletionReport, NeedResult


def trace(scene, stage, **fields):
    event = {"event": "design_pipeline", "scene_id": scene.id, "stage": stage, **fields}
    scene.design_trace = [*scene.design_trace[-1999:], event]
    logging.getLogger("uvicorn.error").info(json.dumps(event, ensure_ascii=True))


def completeness_report(scene, validation):
    requests = requests_for(scene)
    if not requests and not (scene.design_brief and scene.design_brief.furniture):
        return None
    results = []
    room_types = {room.type for room in scene.rooms}
    for need in scene.design_brief.furniture:
        if need.room_type not in room_types:
            results.append(
                NeedResult(
                    requirement_id=f"unassigned:{need.room_type}:{need.role}",
                    room_id="",
                    name=need.name,
                    requested=need.quantity,
                    placed=0,
                    reason=f"No {need.room_type} room exists for this request.",
                    validation_status="not_placed",
                )
            )
    for key, room, need in requests:
        items = [
            item
            for item in scene.furniture
            if item.room_id == room.id
            and item.product_id in CATALOG
            and matches_role(CATALOG[item.product_id], need.role, need.name)
        ]
        # The dressing table's mirror is an integral, dimensionally bounded feature.
        if need.role != "mirror":
            bound = [item for item in items if item.requirement_id == key]
            items = bound + [item for item in items if not item.requirement_id]
        items = items[: need.quantity]
        failures = [
            event
            for event in scene.design_trace
            if event.get("requirement_id") == key and event.get("status") == "missing"
        ]
        relevant_errors = [
            issue
            for issue in validation.issues
            if issue.severity == "error"
            and (issue.object_id in {item.id for item in items} or issue.object_id == room.id)
        ]
        reason = None
        if len(items) < need.quantity:
            reason = (
                failures[-1]["reason"]
                if failures
                else "Not present in the current scene; run furnishing to attempt this requirement."
            )
        results.append(
            NeedResult(
                requirement_id=key,
                room_id=room.id,
                name=need.name,
                requested=need.quantity,
                placed=len(items),
                object_ids=[item.id for item in items],
                product_ids=[item.product_id for item in items],
                reason=reason,
                origin=need.origin,
                priority=need.priority,
                validation_status="invalid"
                if relevant_errors
                else "valid"
                if items
                else "not_placed",
            )
        )
    selections = {entry.product_id for entry in scene.materials}
    fabrics = {item.fabric_color for item in scene.furniture}
    finishes = []
    for request in dict.fromkeys([*scene.design_brief.palette, *scene.design_brief.materials]):
        satisfied = {
            "blush pink": "#d9aeb6" in fabrics,
            "warm cream": "warm_paint" in selections,
            "sage green": "#9baa95" in fabrics,
            "light oak": "pastel_oak_floor" in selections,
            "soft fabrics": any(
                CATALOG[item.product_id].material in {"fabric", "cotton", "wool", "linen"}
                for item in scene.furniture
                if item.product_id in CATALOG
            ),
            "warm natural lighting": any(opening.type == "window" for opening in scene.openings)
            and any(
                CATALOG[item.product_id].category == "lighting"
                for item in scene.furniture
                if item.product_id in CATALOG
            ),
        }.get(
            request.lower(),
            any(
                request.lower() in CATALOG[item.product_id].material.lower()
                for item in [*scene.furniture, *scene.materials]
                if item.product_id in CATALOG
            ),
        )
        finishes.append(
            {
                "name": request,
                "satisfied": satisfied,
                "reason": "Applied in scene; verify appearance in viewport."
                if satisfied
                else "Not satisfied by the selected scene finishes, furniture or openings.",
            }
        )
    requested = sum(item.requested for item in results)
    placed = sum(item.placed for item in results)
    profile = get_profile(scene.style) if scene.design_brief.profile_id else None
    template_rows = []
    if profile:
        for room in scene.rooms:
            for need in scene.design_brief.template_furniture:
                if need.room_type != room.type:
                    continue
                key = f"{room.id}:{need.role}"
                row = next((result for result in results if result.requirement_id == key), None)
                excluded = f"{room.type}:{need.role}" in scene.design_brief.excluded_roles
                if excluded:
                    template_rows.append(
                        NeedResult(
                            requirement_id=key,
                            room_id=room.id,
                            name=need.name,
                            requested=need.quantity,
                            placed=0,
                            origin="template",
                            priority=need.priority,
                            validation_status="overridden",
                            reason="Excluded by the user's explicit requirements; template preference not applied.",
                        )
                    )
                elif row:
                    template_rows.append(
                        row.model_copy(
                            update={
                                "origin": "template",
                                "requested": need.quantity,
                                "reason": (
                                    "User quantity takes precedence over the template suggestion."
                                    if row.requested != need.quantity
                                    else row.reason
                                ),
                                "validation_status": "overridden"
                                if row.requested != need.quantity
                                else row.validation_status,
                            }
                        )
                    )
    actual_materials = [
        CATALOG[item.product_id].material.lower()
        for item in scene.furniture
        if item.product_id in CATALOG
    ] + [
        CATALOG[item.product_id].material.lower()
        for item in scene.materials
        if item.product_id in CATALOG
    ]
    style_preferences = []
    if profile:
        for material in profile.preferred_materials:
            match = any(material in value for value in actual_materials)
            style_preferences.append(
                {
                    "preference": material,
                    "satisfied": match,
                    "reason": "Represented in selected catalogue materials."
                    if match
                    else "Preferred material not represented by eligible selected catalogue products; this is a soft style preference.",
                }
            )
        style_preferences.append(
            {
                "preference": "lighting",
                "satisfied": any(
                    item.light_color == profile.lighting.lamp_color
                    and CATALOG[item.product_id].category == "lighting"
                    for item in scene.furniture
                    if item.product_id in CATALOG
                ),
                "reason": f"Profile suggests {profile.lighting.temperature_kelvin} K with daylight and local task lighting; no lighting objects are invented.",
            }
        )
        for color in profile.palette:
            values = (
                [
                    CATALOG[item.product_id].color
                    for item in scene.materials
                    if item.product_id in CATALOG
                ]
                if color.usage == "base"
                else [
                    item.wood_color if color.usage == "wood" else item.fabric_color
                    for item in scene.furniture
                ]
            )
            style_preferences.append(
                {
                    "preference": f"{color.usage} palette: {color.name} ({color.hex})",
                    "satisfied": color.hex in values,
                    "reason": "Applied to furniture tints or a catalogue surface."
                    if color.hex in values
                    else "Exact profile colour is not represented; explicit user choices and eligible catalogue finishes take precedence.",
                }
            )
    user_complete = all(
        row.placed >= row.requested for row in results if row.origin == "user"
    ) and all(item["satisfied"] for item in finishes)
    return CompletionReport(
        complete=placed == requested
        and validation.valid
        and all(item["satisfied"] for item in finishes),
        items=results,
        requested_count=requested,
        placed_count=placed,
        correction_attempts=max([event.get("attempt", 0) for event in scene.design_trace] or [0]),
        material_requirements=finishes,
        budget_mad=scene.budget_mad,
        total_mad=validation.total_mad,
        within_budget=validation.total_mad <= scene.budget_mad,
        geometry_valid=validation.valid,
        geometry_errors=[issue.message for issue in validation.issues if issue.severity == "error"],
        profile_id=profile.id if profile else None,
        user_requirements_complete=user_complete,
        template_items=template_rows,
        style_preferences=style_preferences,
    )
