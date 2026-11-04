import json
import math
import re

from ortools.sat.python import cp_model
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

from .completeness import trace
from .design_knowledge import attach_profile, chosen_style, get_profile
from .inference import InferenceError, structured
from .interior_brief import interior_brief
from .models import Brief, GenerateRequest, LayoutOrder, Opening, Room, RoomRequirement, Scene, Wall

ROOM_COLORS = {
    "living": "#b8b49c",
    "bedroom": "#a8b7ad",
    "kitchen": "#b8bda5",
    "bathroom": "#9cabb7",
    "office": "#b8aa9c",
}


class PlanningError(ValueError):
    pass


def interpret_brief(prompt: str) -> list[RoomRequirement]:
    try:
        return structured(
            "requirements",
            Brief,
            "Extract rooms and minimum areas in square metres. Repeat entries for multiple rooms. Do not generate coordinates.",
            prompt,
        ).rooms
    except InferenceError as exc:
        raise PlanningError(str(exc)) from exc


def build_walls(rooms: list[Room], width: float, depth: float) -> list[Wall]:
    boundaries = [LineString([*room.polygon, room.polygon[0]]) for room in rooms]
    boundaries.append(LineString([(0, 0), (width, 0), (width, depth), (0, depth), (0, 0)]))
    geometry = unary_union(boundaries)
    lines = list(geometry.geoms) if hasattr(geometry, "geoms") else [geometry]
    segments = set()
    for line in lines:
        coordinates = list(line.coords)
        for start, end in zip(coordinates, coordinates[1:], strict=False):
            segment = tuple(sorted((tuple(start), tuple(end))))
            segments.add(segment)
    return [
        Wall(id=f"wall_{i + 1}", start=start, end=end)
        for i, (start, end) in enumerate(sorted(segments))
    ]


def add_openings(scene: Scene):
    """One exterior entrance and a spanning tree of real shared-wall doors."""
    polygons = {room.id: Polygon(room.polygon) for room in scene.rooms}
    envelope = LineString(
        [(0, 0), (scene.width_m, 0), (scene.width_m, scene.depth_m), (0, scene.depth_m), (0, 0)]
    ).buffer(0.002)
    eligible = [wall for wall in scene.walls if math.dist(wall.start, wall.end) >= 1.2]
    adjoining = {
        wall.id: [
            room.id
            for room in scene.rooms
            if polygons[room.id].boundary.buffer(0.002).covers(LineString([wall.start, wall.end]))
        ]
        for wall in eligible
    }
    root = scene.rooms[0].id
    exterior = [
        wall
        for wall in eligible
        if root in adjoining[wall.id] and envelope.covers(LineString([wall.start, wall.end]))
    ]
    if not exterior:
        raise PlanningError("No usable exterior entrance can be placed for this layout.")
    used = set()

    def door(wall, identifier):
        length = math.dist(wall.start, wall.end)
        scene.openings.append(
            Opening(
                id=identifier,
                type="door",
                wall_id=wall.id,
                offset_m=round((length - 0.9) / 2, 3),
                width_m=0.9,
            )
        )
        used.add(wall.id)

    door(max(exterior, key=lambda wall: math.dist(wall.start, wall.end)), "door_entry")
    reached = {root}
    while len(reached) < len(scene.rooms):
        options = [
            wall
            for wall in eligible
            if len(adjoining[wall.id]) == 2 and len(reached.intersection(adjoining[wall.id])) == 1
        ]
        if not options:
            raise PlanningError(
                "Rooms do not share enough wall length for a connected entrance route."
            )
        wall = max(options, key=lambda wall: math.dist(wall.start, wall.end))
        other = next(room_id for room_id in adjoining[wall.id] if room_id not in reached)
        door(wall, f"door_{other}")
        reached.add(other)
    for wall in scene.walls:
        if wall.id not in used and envelope.covers(LineString([wall.start, wall.end])):
            length = math.dist(wall.start, wall.end)
            if length >= 1.6:
                scene.openings.append(
                    Opening(
                        id=f"window_{wall.id}",
                        type="window",
                        wall_id=wall.id,
                        offset_m=(length - 1.2) / 2,
                        width_m=1.2,
                        height_m=1.2,
                        sill_m=0.9,
                    )
                )


def solve_layout(request: GenerateRequest, project_id: str) -> Scene:
    style = chosen_style(request.style, request.prompt)
    profile = get_profile(style)
    extracted = None
    inferred_finishes = []
    if request.use_model:
        extracted = structured(
            "requirements",
            Brief,
            "Extract every room and minimum area, every requested furniture type with exact quantities and essential/desired priorities, palette and materials. Furniture entries need a room_type, role (bed, bedside_table, vanity, mirror, wardrobe, armchair, bookshelf, rug, lamp, plant, or the user's unsupported name), name and quantity. Never drop an unsupported request. A mirror may be integral to a vanity. Do not generate coordinates.",
            json.dumps(
                {
                    "user_prompt": request.prompt,
                    "chosen_style": style,
                    "style_profile": profile.model_dump(
                        include={
                            "id",
                            "name",
                            "palette",
                            "preferred_materials",
                            "design_characteristics",
                        }
                    )
                    if profile
                    else None,
                    "rule": "Extract explicit user needs only; template suggestions are applied separately and never override the user.",
                }
            ),
        )
        if profile:
            # Models sometimes echo the supplied profile as if the user had
            # demanded each finish. Keep those in the preference layer unless
            # the original prompt actually mentions them.
            inferred_terms = {color.name.lower() for color in profile.palette} | set(
                profile.preferred_materials
            )

            def explicit_or_unrelated(value):
                term = value.lower().strip()
                keep = term not in inferred_terms or bool(
                    re.search(r"\b" + re.escape(term) + r"\b", request.prompt.lower())
                )
                if not keep:
                    inferred_finishes.append(value)
                return keep

            extracted.palette = [
                value for value in extracted.palette if explicit_or_unrelated(value)
            ]
            extracted.materials = [
                value for value in extracted.materials if explicit_or_unrelated(value)
            ]
    requirements = extracted.rooms if extracted else request.rooms
    furnishing_brief = interior_brief(
        request.prompt, extracted, [room.type for room in requirements]
    )
    if request.use_model:
        ordering = structured(
            "design",
            LayoutOrder,
            "Choose an ordering of the indexed room requirements for a rectangular constraint solver. Return every original index exactly once. Do not generate coordinates.",
            json.dumps(
                {
                    "rooms": [room.model_dump() for room in requirements],
                    "width_m": request.width_m,
                    "depth_m": request.depth_m,
                }
            ),
        )
        if sorted(ordering.room_indices) != list(range(len(requirements))):
            raise PlanningError(
                "The design agent returned an invalid room ordering. No layout was saved."
            )
        requirements = [requirements[index] for index in ordering.room_indices]
    # A decimetre grid keeps CP-SAT integral and the search space bounded.
    width, depth = round(request.width_m * 10), round(request.depth_m * 10)
    if sum(room.min_area_m2 for room in requirements) > width * depth / 100:
        raise PlanningError(
            "The minimum room areas exceed the footprint. Increase it or reduce the areas."
        )
    model = cp_model.CpModel()
    variables = []
    x_intervals, y_intervals, areas, distortions = [], [], [], []
    for i, room in enumerate(requirements):
        x = model.new_int_var(0, width, f"x_{i}")
        y = model.new_int_var(0, depth, f"y_{i}")
        w = model.new_int_var(18, width, f"width_{i}")
        d = model.new_int_var(18, depth, f"depth_{i}")
        right = model.new_int_var(0, width, f"right_{i}")
        bottom = model.new_int_var(0, depth, f"bottom_{i}")
        x_intervals.append(model.new_interval_var(x, w, right, f"xi_{i}"))
        y_intervals.append(model.new_interval_var(y, d, bottom, f"yi_{i}"))
        area = model.new_int_var(math.ceil(room.min_area_m2 * 100), width * depth, f"area_{i}")
        model.add_multiplication_equality(area, [w, d])
        distortion = model.new_int_var(0, max(width, depth), f"distortion_{i}")
        model.add_abs_equality(distortion, w - d)
        variables.append((x, y, w, d))
        areas.append(area)
        distortions.append(distortion)
    model.add_no_overlap_2d(x_intervals, y_intervals)
    # Every room shares at least 1.2 m of wall with a predecessor, producing a
    # connected adjacency graph before selecting actual door positions.
    for i, (x, y, w, d) in enumerate(variables):
        if i == 0:
            continue
        neighbors = []
        for j, (ox, oy, ow, od) in enumerate(variables[:i]):
            for direction in range(4):
                link = model.new_bool_var(f"connect_{i}_{j}_{direction}")
                if direction < 2:
                    model.add(x == ox + ow if direction == 0 else x + w == ox).only_enforce_if(link)
                    model.add(y + d >= oy + 12).only_enforce_if(link)
                    model.add(oy + od >= y + 12).only_enforce_if(link)
                else:
                    model.add(y == oy + od if direction == 2 else y + d == oy).only_enforce_if(link)
                    model.add(x + w >= ox + 12).only_enforce_if(link)
                    model.add(ox + ow >= x + 12).only_enforce_if(link)
                neighbors.append(link)
        model.add_bool_or(neighbors)
    model.add(variables[0][0] == 0)
    model.add(variables[0][1] == 0)
    model.maximize(sum(areas) * 100 - sum(distortions))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 42
    result = solver.solve(model)
    if result not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise PlanningError(
            "No feasible layout was found within the search limit. Try a larger footprint or fewer rooms."
        )
    rooms = []
    counts: dict[str, int] = {}
    for i, (requirement, values) in enumerate(zip(requirements, variables, strict=True)):
        x, y, w, d = [solver.value(value) / 10 for value in values]
        counts[requirement.type] = counts.get(requirement.type, 0) + 1
        name = requirement.type.title()
        if requirement.type == "bedroom":
            name += f" {counts[requirement.type]:02}"
        rooms.append(
            Room(
                id=f"room_{i + 1}",
                type=requirement.type,
                name=name,
                polygon=[(x, y), (x + w, y), (x + w, y + d), (x, y + d)],
                color=ROOM_COLORS[requirement.type],
            )
        )
    scene = Scene(
        id=project_id,
        width_m=width / 10,
        depth_m=depth / 10,
        rooms=rooms,
        walls=build_walls(rooms, width / 10, depth / 10),
        budget_mad=request.budget_mad,
        style=style,
        design_brief=furnishing_brief,
        notes=[
            "Rectangular layout on a 0.1 m grid. Areas use wall centre lines; collision checks include actual wall thickness.",
            "Shared-wall doors connect rooms to an exterior entrance. Circulation uses declared design assumptions, not legal building rules.",
            "Text interpreted by Ollama."
            if request.use_model
            else "Generated from the explicit room list.",
        ],
    )
    attach_profile(scene)
    if inferred_finishes:
        trace(
            scene,
            "requirements",
            status="profile_preferences",
            profile_id=profile.id,
            finishes=list(dict.fromkeys(inferred_finishes)),
            reason="Profile-derived finishes unmentioned in the original prompt remain soft preferences, not explicit user demands.",
        )
    add_openings(scene)
    return scene
