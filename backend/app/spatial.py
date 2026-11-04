"""Shared vertical occupancy rules for floor coverings and supported lamps."""

import math

from .catalog import CATALOG


def floor_obstacle(item):
    product = CATALOG.get(item.product_id)
    return product is not None and product.category != "rug" and item.support_id is None


def vertical_overlap(a, b):
    pa, pb = CATALOG[a.product_id], CATALOG[b.product_id]
    if pa.category == "rug" or pb.category == "rug":
        return False
    return (
        min(a.elevation_m + pa.height_m, b.elevation_m + pb.height_m)
        - max(a.elevation_m, b.elevation_m)
        > 0.005
    )


def move_supports(scene, parent, old_position, old_rotation):
    angle = math.radians(parent.rotation_deg - old_rotation)
    for child in scene.furniture:
        if child.support_id != parent.id:
            continue
        x, y = child.position[0] - old_position[0], child.position[1] - old_position[1]
        child.position = (
            parent.position[0] + x * math.cos(angle) - y * math.sin(angle),
            parent.position[1] + x * math.sin(angle) + y * math.cos(angle),
        )
        child.rotation_deg = (child.rotation_deg + parent.rotation_deg - old_rotation) % 360
        child.elevation_m = CATALOG[parent.product_id].height_m


def recenter_supports(scene, parent):
    product = CATALOG[parent.product_id]
    angle = math.radians(parent.rotation_deg)
    for child in scene.furniture:
        if child.support_id != parent.id:
            continue
        lamp = CATALOG[child.product_id]
        if (
            product.category not in {"table", "desk"}
            or lamp.width_m > product.width_m
            or lamp.depth_m > product.depth_m
        ):
            raise ValueError(
                "Remove the mounted lamp before replacing its support with this product."
            )
        x, y = (product.width_m - lamp.width_m) / 2, (product.depth_m - lamp.depth_m) / 2
        child.position = (
            parent.position[0] + x * math.cos(angle) - y * math.sin(angle),
            parent.position[1] + x * math.sin(angle) + y * math.cos(angle),
        )
        child.rotation_deg = parent.rotation_deg
        child.elevation_m = product.height_m
