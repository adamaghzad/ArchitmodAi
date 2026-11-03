from uuid import uuid4

from shapely.geometry import LineString, Polygon

from .catalog import CATALOG, Product, fits, search_products
from .geometry import door_clearances, footprint, placement_clear, validate_scene
from .materials import material_selection
from .models import AddProductRequest, Furniture, Scene


def position_for(scene: Scene, product: Product, room_id: str) -> Furniture | None:
    room = next((room for room in scene.rooms if room.id == room_id), None)
    if room is None or product.kind != "furniture":
        return None
    polygon = Polygon(room.polygon).buffer(-0.2)
    if polygon.is_empty:
        return None
    min_x, min_y, max_x, max_y = polygon.bounds
    occupied = [footprint(old).buffer(0.1) for old in scene.furniture]
    clearances = door_clearances(scene)
    region = polygon.buffer(0.0001)
    wall_bodies = [
        LineString([wall.start, wall.end]).buffer(wall.thickness / 2, cap_style=2)
        for wall in scene.walls
    ]
    for rotation in (0, 90):
        width, depth = (
            (product.width_m, product.depth_m)
            if rotation == 0
            else (product.depth_m, product.width_m)
        )
        for xi in range(max(0, int((max_x - min_x - width) * 5 + 1.001))):
            for yi in range(max(0, int((max_y - min_y - depth) * 5 + 1.001))):
                item = Furniture(
                    id=f"furniture_{uuid4().hex[:12]}",
                    product_id=product.id,
                    room_id=room_id,
                    position=(
                        round(min_x + xi * 0.2 + (product.depth_m if rotation == 90 else 0), 4),
                        round(min_y + yi * 0.2, 4),
                    ),
                    rotation_deg=rotation,
                )
                shape = footprint(item)
                if region.covers(shape) and placement_clear(
                    scene, item, occupied, clearances, region, wall_bodies
                ):
                    return item
    return None


def add_product(scene: Scene, request: AddProductRequest) -> Scene:
    candidate = scene.model_copy(deep=True)
    product = CATALOG.get(request.product_id)
    room = next((room for room in candidate.rooms if room.id == request.room_id), None)
    if product is None or room is None:
        raise ValueError("Select an existing catalogue product and room.")
    existing = None
    if request.replace_id:
        existing = next(
            (
                item
                for item in [*candidate.furniture, *candidate.materials]
                if item.id == request.replace_id
            ),
            None,
        )
        if existing is None or existing.room_id != request.room_id:
            raise ValueError("The item to replace must exist in the selected room.")
        if CATALOG[existing.product_id].kind != product.kind:
            raise ValueError("Replace furniture with furniture or a material with a material.")
        candidate.furniture = [
            item for item in candidate.furniture if item.id != request.replace_id
        ]
        candidate.materials = [
            item for item in candidate.materials if item.id != request.replace_id
        ]
    if product.kind == "furniture":
        item = (
            existing.model_copy(update={"product_id": product.id})
            if isinstance(existing, Furniture)
            else None
        )
        if item is None or not placement_clear(candidate, item):
            item = position_for(candidate, product, room.id)
        if item is None:
            raise ValueError(
                "This product cannot fit without crossing boundaries or furniture. Remove an item or choose a smaller product."
            )
        candidate.furniture.append(item)
    else:
        selection = material_selection(
            candidate, product, room.id, request.surface, request.waste_fraction
        )
        candidate.materials = [
            item
            for item in candidate.materials
            if not (item.room_id == room.id and item.surface == request.surface)
        ]
        candidate.materials.append(selection)
        if request.surface == "floor":
            room.color = product.color
    return candidate


def shopping_list(scene: Scene):
    rows = []
    for item in [*scene.furniture, *scene.materials]:
        product = CATALOG[item.product_id]
        quantity = item.units if hasattr(item, "units") else 1
        rows.append(
            {
                "object_id": item.id,
                "product_id": product.id,
                "name": product.name,
                "room_id": item.room_id,
                "quantity": quantity,
                "unit": product.unit,
                "width_m": product.width_m,
                "depth_m": product.depth_m,
                "height_m": product.height_m,
                "unit_price_mad": product.price_mad,
                "subtotal_mad": round(product.price_mad * quantity, 2),
                "mock_data": product.mock_data,
                "price_status": "mock_data"
                if product.mock_data
                else "confirmed"
                if product.checked_at
                else "estimated",
                "product_url": product.product_url
                if product.verified_url and not product.mock_data
                else None,
                "source_provider": product.source_provider,
                "surface": getattr(item, "surface", None),
                "area_m2": getattr(item, "area_m2", None),
                "waste_fraction": getattr(item, "waste_fraction", None),
            }
        )
    report = validate_scene(scene)
    alternatives = []
    if report.total_mad > scene.budget_mad:
        selected = [*scene.furniture, *scene.materials]
        selected.sort(
            key=lambda item: CATALOG[item.product_id].price_mad * getattr(item, "units", 1),
            reverse=True,
        )
        for item in selected[:5]:
            product = CATALOG[item.product_id]
            current_cost = product.price_mad * getattr(item, "units", 1)
            empty = scene.model_copy(deep=True)
            empty.furniture = [old for old in empty.furniture if old.id != item.id]
            options = []
            for option in search_products(category=product.category, sort="price_asc"):
                if product.kind == "material":
                    replacement = material_selection(
                        empty, option, item.room_id, item.surface, item.waste_fraction
                    )
                    replacement_cost = replacement.units * option.price_mad
                    can_place = True
                else:
                    replacement_cost = option.price_mad
                    can_place = (
                        replacement_cost < current_cost
                        and position_for(empty, option, item.room_id) is not None
                    )
                if replacement_cost < current_cost and can_place:
                    options.append(
                        {
                            "replace_id": item.id,
                            "product_id": option.id,
                            "name": option.name,
                            "saving_mad": round(current_cost - replacement_cost, 2),
                            "room_id": item.room_id,
                            "surface": getattr(item, "surface", "floor"),
                        }
                    )
            if options:
                alternatives.append(max(options, key=lambda option: option["saving_mad"]))
    return {
        "items": rows,
        "total_mad": report.total_mad,
        "budget_mad": scene.budget_mad,
        "over_budget_mad": max(0, round(report.total_mad - scene.budget_mad, 2)),
        "sample_total_mad": round(
            sum(row["subtotal_mad"] for row in rows if row["price_status"] == "mock_data"), 2
        ),
        "confirmed_total_mad": round(
            sum(row["subtotal_mad"] for row in rows if row["price_status"] == "confirmed"), 2
        ),
        "estimated_total_mad": round(
            sum(row["subtotal_mad"] for row in rows if row["price_status"] == "estimated"), 2
        ),
        "alternatives": alternatives,
    }


def compare_products(
    ids: list[str],
    scene: Scene | None = None,
    room_id: str | None = None,
    replace_id: str | None = None,
):
    if len(ids) > 4 or not ids or any(product_id not in CATALOG for product_id in ids):
        raise ValueError("Compare between one and four existing products.")
    if scene and replace_id:
        scene = scene.model_copy(deep=True)
        scene.furniture = [item for item in scene.furniture if item.id != replace_id]
    room = next((room for room in scene.rooms if room.id == room_id), None) if scene else None
    results = []
    for product_id in ids:
        product = CATALOG[product_id]
        bounds = Polygon(room.polygon).bounds if room else None
        results.append(
            {
                "product": product.model_dump(),
                "fits_room_dimensions": fits(product, bounds[2] - bounds[0], bounds[3] - bounds[1])
                if bounds
                else None,
                "can_place_now": position_for(scene, product, room_id) is not None
                if room and product.kind == "furniture"
                else None,
            }
        )
    return results
