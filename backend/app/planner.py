import json
import math

from ortools.sat.python import cp_model
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

from .inference import InferenceError, structured
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
    used = set()
    for room in scene.rooms:
        edge = Polygon(room.polygon).boundary.buffer(0.01)
        candidates = [
            wall
            for wall in scene.walls
            if wall.id not in used
            and math.dist(wall.start, wall.end) >= 1.2
            and edge.covers(LineString([wall.start, wall.end]))
        ]
        if not candidates:
            continue
        wall = max(candidates, key=lambda wall: math.dist(wall.start, wall.end))
        length = math.dist(wall.start, wall.end)
        scene.openings.append(
            Opening(
                id=f"door_{room.id}",
                type="door",
                wall_id=wall.id,
                offset_m=round((length - 0.9) / 2, 3),
                width_m=0.9,
            )
        )
        used.add(wall.id)
    for wall in scene.walls:
        if wall.id not in used and wall.start[1] == wall.end[1] == 0:
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
    requirements = interpret_brief(request.prompt) if request.use_model else request.rooms
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
        style=request.style,
        notes=[
            "Rectangular layout on a 0.1 m grid. Wall thickness is visual; areas use wall centre lines.",
            "Door positions are proposals. Adjacency, daylight, and accessible circulation need review.",
            "Text interpreted by Ollama."
            if request.use_model
            else "Generated from the explicit room list.",
        ],
    )
    add_openings(scene)
    return scene
