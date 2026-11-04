"""Door graph and finite-width circulation checks under declared assumptions."""

import math
from dataclasses import dataclass

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .models import Issue, Opening, Scene


@dataclass
class DoorLink:
    opening: Opening
    rooms: list[str]
    exterior: bool
    center: tuple[float, float]
    normal: tuple[float, float]
    thickness: float


def door_links(scene: Scene):
    walls = {wall.id: wall for wall in scene.walls}
    polygons = {room.id: Polygon(room.polygon) for room in scene.rooms}
    outside = box(0, 0, scene.width_m, scene.depth_m).boundary.buffer(0.002)
    links = []
    for opening in scene.openings:
        wall = walls.get(opening.wall_id)
        if opening.type != "door" or wall is None:
            continue
        length = math.dist(wall.start, wall.end)
        if opening.offset_m + opening.width_m > length + 0.001:
            continue
        dx, dy = ((wall.end[i] - wall.start[i]) / length for i in range(2))
        start = tuple(wall.start[i] + (dx, dy)[i] * opening.offset_m for i in range(2))
        end = (start[0] + dx * opening.width_m, start[1] + dy * opening.width_m)
        line = LineString([start, end])
        rooms = [
            key
            for key, polygon in polygons.items()
            if polygon.is_valid and polygon.area > 0 and polygon.boundary.buffer(0.002).covers(line)
        ]
        links.append(
            DoorLink(
                opening,
                rooms,
                outside.covers(line),
                ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2),
                (-dy, dx),
                wall.thickness,
            )
        )
    return links


def usable(scene: Scene, link: DoorLink):
    assumptions = scene.design_assumptions
    opening = link.opening
    return (
        opening.width_m + 0.001
        >= max(assumptions.min_door_width_m, assumptions.circulation_width_m)
        and opening.height_m + 0.001 >= assumptions.min_door_height_m
        and opening.sill_m <= 0.02
        and (len(link.rooms) == 2 or (len(link.rooms) == 1 and link.exterior))
    )


def approach_zones(scene: Scene):
    zones = []
    for link in door_links(scene):
        nx, ny = link.normal
        tx, ty = ny, -nx
        half = link.opening.width_m / 2
        depth = scene.design_assumptions.door_approach_m + link.thickness / 2
        x, y = link.center
        zones.append(
            (
                link.opening.id,
                Polygon(
                    [
                        (x - tx * half - nx * depth, y - ty * half - ny * depth),
                        (x + tx * half - nx * depth, y + ty * half - ny * depth),
                        (x + tx * half + nx * depth, y + ty * half + ny * depth),
                        (x - tx * half + nx * depth, y - ty * half + ny * depth),
                    ]
                ),
            )
        )
    return zones


def circulation_regions(scene: Scene, room_id: str, shapes: dict):
    room = next(room for room in scene.rooms if room.id == room_id)
    polygon = Polygon(room.polygon)
    if not polygon.is_valid or polygon.area <= 0:
        return []
    radius = scene.design_assumptions.circulation_width_m / 2
    obstacles = [
        LineString([wall.start, wall.end]).buffer(wall.thickness / 2 + radius, cap_style=2)
        for wall in scene.walls
    ]
    obstacles.extend(
        shape.buffer(radius, join_style=2) for shape in shapes.values() if polygon.intersects(shape)
    )
    free = polygon.buffer(-radius, join_style=2).difference(unary_union(obstacles))
    return [
        part
        for part in (list(free.geoms) if hasattr(free, "geoms") else [free])
        if part.geom_type == "Polygon" and part.area > 0.0001
    ]


def portal_point(scene: Scene, link: DoorLink, room_id: str):
    polygon = Polygon(next(room.polygon for room in scene.rooms if room.id == room_id))
    distance = link.thickness / 2 + scene.design_assumptions.circulation_width_m / 2 + 0.015
    for sign in (1, -1):
        point = Point(
            link.center[0] + link.normal[0] * distance * sign,
            link.center[1] + link.normal[1] * distance * sign,
        )
        if polygon.contains(point):
            return point
    return Point(link.center)


def circulation_clear(scene: Scene, room_id: str, shapes: dict):
    """Candidate placement must retain every doorway and usable circulation island."""
    regions = circulation_regions(scene, room_id, shapes)
    links = [link for link in door_links(scene) if room_id in link.rooms and usable(scene, link)]
    if not links:
        return False
    entrances = [portal_point(scene, link, room_id) for link in links]
    if any(
        not any(region.buffer(0.002).covers(point) for region in regions) for point in entrances
    ):
        return False
    # All entrances must connect through one walkable region.
    return any(
        all(region.buffer(0.002).covers(point) for point in entrances)
        and all(
            other is region or other.area < scene.design_assumptions.circulation_width_m**2
            for other in regions
        )
        for region in regions
    )


def access_issues(scene: Scene, shapes: dict):
    issues = []
    links = door_links(scene)
    graph = {room.id: set() for room in scene.rooms}
    graph["outside"] = set()
    for link in links:
        if not usable(scene, link):
            issues.append(
                Issue(
                    code="door_access",
                    object_id=link.opening.id,
                    related_object_ids=link.rooms,
                    message="Door must connect rooms or the exterior, have a floor-level sill, and meet the declared width/height assumptions.",
                )
            )
            continue
        nodes = [*link.rooms, *(["outside"] if link.exterior else [])]
        for a in nodes:
            graph[a].update(node for node in nodes if node != a)
    reached, pending = set(), ["outside"]
    while pending:
        node = pending.pop()
        if node not in reached:
            reached.add(node)
            pending.extend(graph[node] - reached)
    for room in scene.rooms:
        polygon = Polygon(room.polygon)
        if not polygon.is_valid or polygon.area <= 0:
            continue
        if room.id not in reached:
            issues.append(
                Issue(
                    code="room_unreachable",
                    object_id=room.id,
                    message="Room has no usable door route to an exterior entrance.",
                )
            )
        elif not circulation_clear(scene, room.id, shapes):
            related = [item.id for item in scene.furniture if item.room_id == room.id]
            issues.append(
                Issue(
                    code="circulation_blocked",
                    object_id=room.id,
                    related_object_ids=related,
                    message="Door approaches or circulation regions are disconnected at the declared path width.",
                )
            )
    for opening_id, zone in approach_zones(scene):
        for item_id, shape in shapes.items():
            if shape.intersection(zone).area > 0.001:
                issues.append(
                    Issue(
                        code="door_approach_obstructed",
                        object_id=item_id,
                        related_object_ids=[opening_id],
                        message="Furniture blocks the declared door approach clearance.",
                    )
                )
    return issues
