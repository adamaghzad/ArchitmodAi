import math
from itertools import combinations

from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .access import access_issues, approach_zones, circulation_clear
from .catalog import CATALOG, total_cost
from .materials import material_cost, material_selection
from .models import Furniture, Issue, Scene, ValidationReport


def footprint(item: Furniture):
    product = CATALOG[item.product_id]
    shape = box(0, 0, product.width_m, product.depth_m)
    shape = affinity.rotate(shape, item.rotation_deg, origin=(0, 0))
    return affinity.translate(shape, xoff=item.position[0], yoff=item.position[1])


def door_clearances(scene: Scene):
    result = []
    walls = {wall.id: wall for wall in scene.walls}
    rooms = [Polygon(room.polygon) for room in scene.rooms]
    for opening in scene.openings:
        wall = walls.get(opening.wall_id)
        if opening.type != "door" or wall is None:
            continue
        angle = math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0])
        x = wall.start[0] + math.cos(angle) * opening.offset_m
        y = wall.start[1] + math.sin(angle) * opening.offset_m
        sample = (
            x + math.cos(angle) * opening.width_m / 2 - math.sin(angle) * 0.25,
            y + math.sin(angle) * opening.width_m / 2 + math.cos(angle) * 0.25,
        )
        swing = 1 if any(room.is_valid and room.contains(Point(sample)) for room in rooms) else -1
        points = [(x, y)] + [
            (
                x + math.cos(angle + swing * step * math.pi / 24) * opening.width_m,
                y + math.sin(angle + swing * step * math.pi / 24) * opening.width_m,
            )
            for step in range(13)
        ]
        result.append((opening.id, Polygon(points)))
    return result


def placement_clear(
    scene: Scene, item: Furniture, occupied=None, clearances=None, region=None, wall_bodies=None
):
    shape = footprint(item)
    room = next((room for room in scene.rooms if room.id == item.room_id), None)
    allowed = (
        region if region is not None else Polygon(room.polygon).buffer(0.001) if room else None
    )
    if allowed is None or not allowed.covers(shape):
        return False
    shapes = (
        occupied
        if occupied is not None
        else [footprint(other).buffer(0.08) for other in scene.furniture if other.id != item.id]
    )
    doors = (
        clearances if clearances is not None else [*door_clearances(scene), *approach_zones(scene)]
    )
    walls = (
        wall_bodies
        if wall_bodies is not None
        else [
            LineString([wall.start, wall.end]).buffer(wall.thickness / 2, cap_style=2)
            for wall in scene.walls
        ]
    )
    clear = (
        not any(shape.intersects(other) for other in shapes)
        and not any(shape.intersection(zone).area > 0.001 for _, zone in doors)
        and not any(shape.intersection(body).area > 0.001 for body in walls)
    )
    if not clear:
        return False
    footprints = {
        other.id: footprint(other)
        for other in scene.furniture
        if other.id != item.id and other.product_id in CATALOG
    }
    footprints[item.id] = shape
    return circulation_clear(scene, item.room_id, footprints)


def validate_scene(scene: Scene) -> ValidationReport:
    issues: list[Issue] = []

    def error(code: str, message: str, object_id: str | None = None, related=None):
        issues.append(
            Issue(code=code, message=message, object_id=object_id, related_object_ids=related or [])
        )

    objects = [*scene.rooms, *scene.walls, *scene.openings, *scene.furniture, *scene.materials]
    ids = [obj.id for obj in objects]
    if len(ids) != len(set(ids)):
        error("duplicate_id", "Every scene object must have a unique ID.")
    if not scene.scale_confirmed:
        error("scale_unconfirmed", "Confirm the reference dimensions before approval.")
    if not scene.rooms:
        error("empty_scene", "The scene must contain at least one room.")
    boundary = box(0, 0, scene.width_m, scene.depth_m)
    rooms = {room.id: Polygon(room.polygon) for room in scene.rooms}
    valid_rooms = {key: value for key, value in rooms.items() if value.is_valid and value.area > 0}
    walls = {wall.id: wall for wall in scene.walls}
    lines = [LineString([wall.start, wall.end]) for wall in scene.walls]
    wall_union = unary_union(lines).buffer(0.015)
    for wall in scene.walls:
        if not boundary.buffer(0.001).covers(LineString([wall.start, wall.end])):
            error("wall_outside", "Wall endpoints must stay inside the footprint.", wall.id)
    for a, b in combinations(scene.walls, 2):
        if LineString([a.start, a.end]).intersection(LineString([b.start, b.end])).length > 0.001:
            error(
                "wall_overlap",
                "Wall centre lines overlap. Merge duplicate wall segments.",
                a.id,
                [b.id],
            )
    for room in scene.rooms:
        polygon = rooms[room.id]
        if room.id not in valid_rooms:
            error("invalid_room", "Room polygon is invalid or has no area.", room.id)
            continue
        if not boundary.buffer(0.001).covers(polygon):
            error("room_outside", "Room extends beyond the project footprint.", room.id)
        if not wall_union.covers(polygon.boundary):
            error("unclosed_room", "Room boundaries no longer match the walls.", room.id)
    for (a_id, a), (b_id, b) in combinations(valid_rooms.items(), 2):
        if a.intersection(b).area > 0.001:
            error("room_overlap", f"Rooms {a_id} and {b_id} overlap.", a_id, [b_id])
    for opening in scene.openings:
        wall = walls.get(opening.wall_id)
        if wall is None:
            error("missing_wall", "Opening refers to a missing wall.", opening.id)
        elif (
            opening.offset_m + opening.width_m > math.dist(wall.start, wall.end) + 0.001
            or opening.sill_m + opening.height_m > wall.height + 0.001
        ):
            error("opening_outside", "Opening does not fit within its wall.", opening.id)
    for a, b in combinations(scene.openings, 2):
        if (
            a.wall_id == b.wall_id
            and min(a.offset_m + a.width_m, b.offset_m + b.width_m) - max(a.offset_m, b.offset_m)
            > 0.001
        ):
            error("opening_overlap", "Openings on the same wall overlap.", a.id)
    shapes = {}
    for item in scene.furniture:
        if item.product_id not in CATALOG or CATALOG[item.product_id].kind != "furniture":
            error("unknown_product", "Furniture must refer to a known catalogue product.", item.id)
            continue
        shape = footprint(item)
        shapes[item.id] = shape
        room = valid_rooms.get(item.room_id)
        if room is None or not room.buffer(0.001).covers(shape):
            error("furniture_outside", "Furniture must stay inside its assigned room.", item.id)
    for (a_id, a), (b_id, b) in combinations(shapes.items(), 2):
        if a.intersection(b).area > 0.001:
            error("furniture_overlap", f"Furniture {a_id} and {b_id} overlap.", a_id, [b_id])
    for opening_id, zone in door_clearances(scene):
        for item_id, shape in shapes.items():
            if shape.intersection(zone).area > 0.001:
                error(
                    "door_obstruction",
                    "Furniture obstructs the door swing. Move it clear of the opening.",
                    item_id,
                    [opening_id],
                )
    for wall in scene.walls:
        body = LineString([wall.start, wall.end]).buffer(wall.thickness / 2, cap_style=2)
        for item_id, shape in shapes.items():
            if shape.intersection(body).area > 0.001:
                error(
                    "furniture_wall_collision",
                    "Furniture intersects the actual wall thickness. Move it inside the room.",
                    item_id,
                    [wall.id],
                )
    known_items = [item for item in scene.furniture if item.product_id in CATALOG]
    issues.extend(access_issues(scene, shapes))
    furniture_total = total_cost(known_items)
    for selection in scene.materials:
        product = CATALOG.get(selection.product_id)
        if product is None or product.kind != "material" or selection.room_id not in valid_rooms:
            error(
                "invalid_material",
                "Material must reference an existing room and catalogue material.",
                selection.id,
            )
            continue
        try:
            expected = material_selection(
                scene, product, selection.room_id, selection.surface, selection.waste_fraction
            )
            if (
                expected.units != selection.units
                or abs(expected.area_m2 - selection.area_m2) > 0.01
            ):
                error(
                    "material_quantity",
                    "Material quantities no longer match room geometry.",
                    selection.id,
                )
        except ValueError:
            error(
                "invalid_material_surface",
                "Material is not compatible with its selected surface.",
                selection.id,
            )
    materials_total = material_cost(scene)
    total = round(furniture_total + materials_total, 2)
    if total > scene.budget_mad:
        error("over_budget", "Selected furniture and materials exceed the declared budget.")
    issues.extend(
        [
            Issue(
                code="concept_only",
                severity="warning",
                message="Access is checked under configurable design assumptions. Services and building regulations are not evaluated.",
            ),
            Issue(
                code="sample_catalogue",
                severity="warning",
                message="Catalogue prices are illustrative; delivery, installation, and unselected finishes are excluded.",
            ),
        ]
    )
    return ValidationReport(
        valid=not any(issue.severity == "error" for issue in issues),
        issues=issues,
        total_mad=total,
        furniture_total_mad=furniture_total,
        materials_total_mad=materials_total,
    )
