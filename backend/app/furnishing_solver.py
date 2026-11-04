"""Bounded catalogue placement: Shapely candidate regions and CP-SAT selection."""

import math
from dataclasses import dataclass
from uuid import uuid4

from ortools.sat.python import cp_model
from shapely import STRtree
from shapely.geometry import LineString, Polygon, box

from .access import approach_zones
from .catalog import CATALOG, PRODUCTS, total_cost
from .completeness import trace
from .design_knowledge import get_profile
from .geometry import door_clearances, footprint, placement_clear, validate_scene
from .interior_brief import ROLE_PRODUCTS, matches_role, requests_for
from .marketplace import position_for
from .materials import material_cost
from .models import Furniture
from .spatial import floor_obstacle
from .style_ranking import rank_products


@dataclass
class Candidate:
    slot: str
    item: Furniture
    shape: object
    score: int
    priority: str


def styled(item, scene):
    profile = get_profile(scene.style)
    if profile:
        palette = (
            {name.lower() for name in scene.design_brief.palette} if scene.design_brief else set()
        )
        fabric = "#d9aeb6" if "blush pink" in palette else profile.color("fabric")
        accent = "#9baa95" if "sage green" in palette else profile.color("accent")
        item.fabric_color = (
            accent if CATALOG[item.product_id].category in {"chair", "rug"} else fabric
        )
        item.wood_color = "#e2cba6" if "light oak" in palette else profile.color("wood")
        item.light_color = profile.lighting.lamp_color
    return item


def product_options(need, room, preferred, style="Pastel", scene=None):
    pool = [
        p
        for p in PRODUCTS
        if p.kind == "furniture"
        and room.type in p.room_types
        and matches_role(p, need.role, need.name)
    ]
    if scene is not None:
        ranked = rank_products(scene, room, pool)
        order = {key: i for i, key in enumerate(preferred)}
        ranked.sort(key=lambda row: (order.get(row["product_id"], 9999), -row["score"]))
        selected = ranked[:3]
        if len(ranked) > 3:
            cheapest = min(ranked, key=lambda row: row["estimated_mad"])
            if cheapest not in selected:
                selected[-1] = cheapest
        return [CATALOG[row["product_id"]] for row in selected]
    order = ROLE_PRODUCTS.get(need.role, [])
    pool.sort(
        key=lambda p: (
            p.design_style != style,
            p.id not in preferred,
            order.index(p.id) if p.id in order else 999,
            p.price_mad,
        )
    )
    if need.role == "bed":
        single = "single" in need.name.lower()
        pool = [p for p in pool if (p.width_m < 1.35 if single else p.width_m >= 1.35)]
        if style == "Pastel" and not single:
            pool.sort(key=lambda p: p.id != "pastel_double_bed")
    return pool[:3]


def furniture_at(product, room_id, x, y, rotation, key):
    # Convert axis-aligned bounds back to the canonical rotated local origin.
    w, d = (
        (product.width_m, product.depth_m)
        if rotation % 180 == 0
        else (product.depth_m, product.width_m)
    )
    origin = {0: (x, y), 90: (x + w, y), 180: (x + w, y + d), 270: (x, y + d)}[rotation]
    return Furniture(
        id=f"furniture_{uuid4().hex[:12]}",
        product_id=product.id,
        room_id=room_id,
        position=origin,
        rotation_deg=rotation,
        requirement_id=key,
    )


def candidates_for(scene, room, need, key, index, product, attempt):
    polygon = Polygon(room.polygon)
    x0, y0, x1, y1 = polygon.bounds
    margin = max(wall.thickness for wall in scene.walls) / 2 + 0.06
    region = polygon.buffer(-margin)
    doors = [shape for _, shape in [*door_clearances(scene), *approach_zones(scene)]]
    walls = [
        LineString([wall.start, wall.end]).buffer(wall.thickness / 2, cap_style=2)
        for wall in scene.walls
    ]
    existing = [footprint(item).buffer(0.06) for item in scene.furniture if floor_obstacle(item)]
    bed = next(
        (
            item
            for item in scene.furniture
            if item.room_id == room.id and CATALOG[item.product_id].category == "bed"
        ),
        None,
    )
    target = None
    if bed and need.role == "bedside_table":
        bp = CATALOG[bed.product_id]
        angle = math.radians(bed.rotation_deg)
        side = -1 if index == 0 else 1
        local = (
            bp.width_m / 2 + side * (bp.width_m / 2 + product.width_m / 2 + 0.12),
            product.depth_m / 2 + 0.04,
        )
        target = (
            bed.position[0] + local[0] * math.cos(angle) - local[1] * math.sin(angle),
            bed.position[1] + local[0] * math.sin(angle) + local[1] * math.cos(angle),
        )
    output = []
    for rotation in (0, 90, 180, 270):
        w, d = (
            (product.width_m, product.depth_m)
            if rotation % 180 == 0
            else (product.depth_m, product.width_m)
        )
        step = 0.25 if attempt == 0 else 0.125
        xs = {
            round(x0 + margin + i * step, 4)
            for i in range(max(0, int((x1 - x0 - 2 * margin - w) / step) + 1))
        }
        ys = {
            round(y0 + margin + i * step, 4)
            for i in range(max(0, int((y1 - y0 - 2 * margin - d) / step) + 1))
        }
        xs.update([x1 - margin - w, (x0 + x1 - w) / 2])
        ys.update([y1 - margin - d, (y0 + y1 - d) / 2])
        if target:
            xs.add(target[0] - w / 2)
            ys.add(target[1] - d / 2)
        for x in sorted(xs):
            for y in sorted(ys):
                shape = box(x, y, x + w, y + d)
                if not region.buffer(0.0001).covers(shape) or any(
                    shape.intersection(obstacle).area > 0.001
                    for obstacle in [*doors, *walls, *existing]
                ):
                    continue
                cx, cy = x + w / 2, y + d / 2
                distance = min(x - x0, y - y0, x1 - x - w, y1 - y - d)
                score = 300 - round(distance * 120)
                # Furniture fronts face into the room, and the bed anchors the
                # rear wall. Nightstands are actually beside its headboard.
                head_distance = {0: y - y0, 90: x1 - x - w, 180: y1 - y - d, 270: x - x0}[rotation]
                score -= round(head_distance * 100)
                if need.role == "bed":
                    score -= round(abs(cx - (x0 + x1) / 2) * 100 + (y - y0) * 50)
                if target:
                    dist = math.hypot(cx - target[0], cy - target[1])
                    if dist > 0.42:
                        continue
                    score += 300 - round(dist * 500)
                if need.role == "armchair":
                    score += round((y - y0) * 25)
                if need.role == "plant":
                    target_plant = (
                        x0 + margin + 0.2,
                        y0 + margin + 0.2 if index % 2 == 0 else y1 - margin - 0.2,
                    )
                    score -= round(math.hypot(cx - target_plant[0], cy - target_plant[1]) * 60)
                if product.height_m > 1.6:
                    blocked = False
                    for opening in scene.openings:
                        if opening.type != "window":
                            continue
                        wall = next(w for w in scene.walls if w.id == opening.wall_id)
                        length = math.dist(wall.start, wall.end)
                        dx, dy = [(wall.end[i] - wall.start[i]) / length for i in range(2)]
                        line = LineString(
                            [
                                (
                                    wall.start[0] + dx * opening.offset_m,
                                    wall.start[1] + dy * opening.offset_m,
                                ),
                                (
                                    wall.start[0] + dx * (opening.offset_m + opening.width_m),
                                    wall.start[1] + dy * (opening.offset_m + opening.width_m),
                                ),
                            ]
                        )
                        if shape.intersection(line.buffer(0.4, cap_style=2)).area > 0.001:
                            blocked = True
                            break
                    if blocked:
                        continue
                item = styled(furniture_at(product, room.id, x, y, rotation, key), scene)
                output.append(Candidate(f"{key}:{index}", item, shape, score, need.priority))
    # Keep spatial variety, then cap the finite search per requirement/product.
    output.sort(key=lambda candidate: -candidate.score)
    unique = {}
    for candidate in output:
        marker = (*[round(v, 2) for v in candidate.shape.bounds], candidate.item.rotation_deg)
        unique.setdefault(marker, candidate)
    return list(unique.values())[: (40 if attempt == 0 else 60)]


def place_requested(scene, choices, attempt=0):
    scene = scene.model_copy(deep=True)
    requests = requests_for(scene)
    requests.sort(
        key=lambda row: (
            row[2].priority != "essential",
            row[2].origin != "user",
            row[2].role != "bed",
        )
    )
    slots = []
    for key, room, need in requests:
        have = sum(
            item.room_id == room.id and matches_role(CATALOG[item.product_id], need.role, need.name)
            for item in scene.furniture
        )
        for index in range(have, need.quantity):
            if need.role != "mirror":
                slots.append((key, room, need, index))
    # Anchor a bed first. Existing user furniture is never moved or deleted.
    for key, room, need, index in list(slots):
        if need.role != "bed":
            continue
        options = product_options(need, room, choices.get(room.id, []), scene.style, scene)
        # Style is subordinate to essential room coverage. Reserve a lower-bound
        # cost for other outstanding essentials before anchoring a preferred bed.
        remaining = scene.budget_mad - total_cost(scene.furniture) - material_cost(scene)
        reserve = 0
        for other_key, other_room, other_need, other_index in slots:
            if (other_key, other_index) == (key, index) or other_need.priority != "essential":
                continue
            alternatives = product_options(
                other_need, other_room, choices.get(other_room.id, []), scene.style, scene
            )
            reserve += min((p.price_mad for p in alternatives), default=0)
        if any(p.price_mad + reserve <= remaining for p in options):
            options.sort(key=lambda p: p.price_mad + reserve > remaining)
        elif reserve > 0:
            options.sort(key=lambda p: p.price_mad)
        placed = False
        for product in options:
            if (
                total_cost(scene.furniture) + material_cost(scene) + product.price_mad
                > scene.budget_mad
            ):
                continue
            for candidate in candidates_for(scene, room, need, key, index, product, attempt):
                if placement_clear(scene, candidate.item):
                    scene.furniture.append(candidate.item)
                    placed = True
                    break
            if placed:
                break
        slots.remove((key, room, need, index))
    pool = []
    for key, room, need, index in slots:
        if need.role in {"lamp", "rug"}:
            continue
        for rank, product in enumerate(
            product_options(need, room, choices.get(room.id, []), scene.style, scene)
        ):
            candidates = candidates_for(scene, room, need, key, index, product, attempt)
            for candidate in candidates:
                candidate.score += (3 - rank) * 1000
            pool.extend(candidates)
    model = cp_model.CpModel()
    variables = [model.new_bool_var(f"candidate_{i}") for i in range(len(pool))]
    for slot in sorted({candidate.slot for candidate in pool}):
        model.add_at_most_one(
            variables[i] for i, candidate in enumerate(pool) if candidate.slot == slot
        )
    if pool:
        shapes = [candidate.shape.buffer(0.05, join_style=2) for candidate in pool]
        tree = STRtree(shapes)
        for i, shape in enumerate(shapes):
            for j in tree.query(shape, predicate="intersects"):
                if j > i and pool[i].slot != pool[j].slot:
                    model.add(variables[i] + variables[int(j)] <= 1)
        remaining = max(0, scene.budget_mad - total_cost(scene.furniture) - material_cost(scene))
        model.add(
            sum(
                round(CATALOG[candidate.item.product_id].price_mad * 100) * variables[i]
                for i, candidate in enumerate(pool)
            )
            <= round(remaining * 100)
        )
        # One essential item outweighs every optional pose preference in a room.
        weights = {"essential": 10000000, "desired": 100000, "optional": 1000}
        model.maximize(
            sum(
                (weights[candidate.priority] + candidate.score) * variables[i]
                for i, candidate in enumerate(pool)
            )
        )
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 2
        solver.parameters.num_search_workers = 1
        for _ in range(3):
            status = solver.solve(model)
            if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                break
            selected = [i for i in range(len(pool)) if solver.value(variables[i])]
            trial = scene.model_copy(deep=True)
            trial.furniture.extend(pool[i].item for i in selected)
            if validate_scene(trial).valid:
                scene = trial
                break
            if not selected:
                break
            model.add(sum(variables[i] for i in selected) <= len(selected) - 1)
        else:
            # Retain a safe subset if the finite global search cannot keep all
            # circulation regions connected; the report records every omission.
            for i in sorted(selected, key=lambda i: pool[i].priority != "essential"):
                if placement_clear(scene, pool[i].item):
                    scene.furniture.append(pool[i].item)
    for key, room, need in requests:
        if need.role not in {"lamp", "rug"}:
            continue
        have = sum(
            item.room_id == room.id and matches_role(CATALOG[item.product_id], need.role, need.name)
            for item in scene.furniture
        )
        for _ in range(have, need.quantity):
            for product in product_options(
                need, room, choices.get(room.id, []), scene.style, scene
            ):
                if (
                    total_cost(scene.furniture) + material_cost(scene) + product.price_mad
                    > scene.budget_mad
                ):
                    continue
                item = position_for(scene, product, room.id)
                if item:
                    if need.role == "rug":
                        # Put a floor covering under the bed's foot instead of
                        # treating it as a full-height circulation obstruction.
                        bed = next(
                            (
                                f
                                for f in scene.furniture
                                if f.room_id == room.id and CATALOG[f.product_id].category == "bed"
                            ),
                            None,
                        )
                        if bed:
                            bp = CATALOG[bed.product_id]
                            angle = math.radians(bed.rotation_deg)
                            local_x, local_y = bp.width_m / 2, bp.depth_m - 0.55
                            cx = (
                                bed.position[0]
                                + local_x * math.cos(angle)
                                - local_y * math.sin(angle)
                            )
                            cy = (
                                bed.position[1]
                                + local_x * math.sin(angle)
                                + local_y * math.cos(angle)
                            )
                            proposed = furniture_at(
                                product,
                                room.id,
                                cx - product.width_m / 2,
                                cy - product.depth_m / 2,
                                0,
                                key,
                            )
                            if placement_clear(scene, proposed):
                                item = proposed
                    item.requirement_id = key
                    scene.furniture.append(styled(item, scene))
                    break
    for key, room, need in requests:
        items = [
            item
            for item in scene.furniture
            if item.room_id == room.id
            and matches_role(CATALOG[item.product_id], need.role, need.name)
        ]
        for index in range(need.quantity):
            item = items[index] if index < len(items) else None
            options = product_options(need, room, choices.get(room.id, []), scene.style, scene)
            compatible = [
                p
                for p in PRODUCTS
                if p.kind == "furniture"
                and room.type in p.room_types
                and matches_role(p, need.role, need.name)
            ]
            remaining = scene.budget_mad - total_cost(scene.furniture) - material_cost(scene)
            reason = (
                None
                if item
                else "No catalogue product supports this requirement."
                if not compatible
                else "Remaining budget cannot cover an eligible product."
                if min(p.price_mad for p in compatible) > remaining
                else "Catalogue products do not fit the room dimensions."
                if not options
                else "No placement found within the bounded search while preserving boundaries, door clearance and 0.6 m circulation."
            )
            trace(
                scene,
                "placement",
                requirement_id=key,
                instance=index + 1,
                requested=need.name,
                product_id=item.product_id if item else (options[0].id if options else None),
                object_id=item.id if item else None,
                position=item.position if item else None,
                elevation_m=item.elevation_m if item else None,
                status="placed" if item else "missing",
                reason=reason,
                attempt=attempt,
            )
    return scene
