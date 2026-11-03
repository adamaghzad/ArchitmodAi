import math
from decimal import Decimal
from uuid import uuid4

from shapely.geometry import LineString, Polygon

from .catalog import CATALOG, Product
from .models import MaterialSelection, Scene


def surface_area(scene: Scene, room_id: str, surface: str) -> float:
    room = next((room for room in scene.rooms if room.id == room_id), None)
    if room is None:
        raise ValueError("Select an existing room.")
    polygon = Polygon(room.polygon)
    if surface == "floor":
        return polygon.area
    area = 0.0
    for wall in scene.walls:
        length = polygon.boundary.intersection(LineString([wall.start, wall.end])).length
        if length > 0.001:
            area += length * wall.height
            area -= sum(
                opening.width_m * opening.height_m
                for opening in scene.openings
                if opening.wall_id == wall.id
            )
    return max(0, area)


def material_selection(
    scene: Scene, product: Product, room_id: str, surface: str, waste: float = 0.1
):
    if product.kind != "material" or not product.coverage_m2_per_unit:
        raise ValueError("Select a material with stored coverage information.")
    if (product.category == "flooring") != (surface == "floor"):
        raise ValueError(
            "Flooring is applied to floors; paint and wall finishes are applied to walls."
        )
    area = surface_area(scene, room_id, surface)
    return MaterialSelection(
        id=f"material_{uuid4().hex[:12]}",
        product_id=product.id,
        room_id=room_id,
        surface=surface,
        area_m2=round(area, 4),
        waste_fraction=waste,
        units=max(1, math.ceil(area * (1 + waste) / product.coverage_m2_per_unit - 1e-9)),
    )


def material_cost(scene: Scene) -> float:
    return float(
        sum(
            (
                Decimal(str(CATALOG[item.product_id].price_mad)) * item.units
                for item in scene.materials
                if item.product_id in CATALOG
            ),
            Decimal(0),
        )
    )


def refresh_quantities(scene: Scene):
    for selection in scene.materials:
        product = CATALOG.get(selection.product_id)
        if product is None:
            continue
        updated = material_selection(
            scene, product, selection.room_id, selection.surface, selection.waste_fraction
        )
        selection.area_m2, selection.units = updated.area_m2, updated.units
