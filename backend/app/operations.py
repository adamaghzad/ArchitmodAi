"""Apply validated data operations to a copy; callers own preview and approval."""

from uuid import uuid4

from .catalog import CATALOG
from .completeness import trace
from .marketplace import add_product
from .materials import refresh_quantities
from .models import AddProductRequest, AgentOperation, Furniture, Scene
from .spatial import move_supports


def apply_operations(scene: Scene, operations: list[AgentOperation]) -> Scene:
    candidate = scene.model_copy(deep=True)
    for operation in operations:
        item = next((item for item in candidate.furniture if item.id == operation.object_id), None)
        wall = next((item for item in candidate.walls if item.id == operation.object_id), None)
        room = next((item for item in candidate.rooms if item.id == operation.object_id), None)
        opening = next(
            (item for item in candidate.openings if item.id == operation.object_id), None
        )
        if operation.type in ("place_furniture", "replace_furniture", "change_material"):
            product = CATALOG.get(operation.product_id)
            room_id = operation.room_id or (item.room_id if item else None)
            if not product or not room_id:
                raise ValueError("Operation requires an existing catalogue product and room.")
            if operation.type == "change_material" and product.kind != "material":
                raise ValueError("Material operations require a stored material product.")
            if operation.type != "change_material" and product.kind != "furniture":
                raise ValueError("Furniture operations require a stored furniture product.")
            if operation.type == "replace_furniture" and item is None:
                raise ValueError("Replacement must refer to an existing furniture object.")
            if operation.type == "place_furniture" and operation.position is not None:
                if not any(room.id == room_id for room in candidate.rooms):
                    raise ValueError("Furniture room does not exist.")
                if operation.object_id in {
                    value.id
                    for value in [
                        *candidate.rooms,
                        *candidate.walls,
                        *candidate.openings,
                        *candidate.furniture,
                    ]
                }:
                    raise ValueError("New furniture ID already exists.")
                candidate.furniture.append(
                    Furniture(
                        id=operation.object_id or f"furniture_{uuid4().hex[:12]}",
                        product_id=product.id,
                        room_id=room_id,
                        position=operation.position,
                        rotation_deg=operation.rotation_deg or 0,
                    )
                )
            else:
                candidate = add_product(
                    candidate,
                    AddProductRequest(
                        expected_revision=0,
                        product_id=product.id,
                        room_id=room_id,
                        replace_id=item.id if operation.type == "replace_furniture" else None,
                        surface=operation.surface or "floor",
                    ),
                )
        elif operation.type == "move_furniture" and item and operation.position is not None:
            old_position, old_rotation = item.position, item.rotation_deg
            item.position = operation.position
            if operation.rotation_deg is not None:
                item.rotation_deg = operation.rotation_deg
            move_supports(candidate, item, old_position, old_rotation)
        elif operation.type in ("delete_furniture", "remove_furniture") and item:
            children = [other for other in candidate.furniture if other.support_id == item.id]
            for child in children:
                trace(
                    candidate,
                    "placement",
                    requirement_id=child.requirement_id,
                    object_id=child.id,
                    status="missing",
                    reason="Mounted lamp removed with its deleted support table.",
                )
            candidate.furniture = [
                other
                for other in candidate.furniture
                if other.id != item.id and other.support_id != item.id
            ]
        elif operation.type == "update_wall" and wall:
            fields = ("start", "end", "height", "thickness")
            if not any(getattr(operation, field) is not None for field in fields):
                raise ValueError("Wall update needs at least one wall property.")
            for field in fields:
                if getattr(operation, field) is not None:
                    setattr(wall, field, getattr(operation, field))
        elif operation.type == "update_opening" and opening:
            fields = ("offset_m", "width_m", "height_m", "sill_m")
            if not any(getattr(operation, field) is not None for field in fields):
                raise ValueError("Opening update needs at least one opening property.")
            for field in fields:
                if getattr(operation, field) is not None:
                    setattr(opening, field, getattr(operation, field))
        elif operation.type == "update_room" and room:
            if not any(
                value is not None
                for value in (operation.polygon, operation.name, operation.room_type)
            ):
                raise ValueError("Room update needs a boundary, name or type.")
            if operation.polygon is not None:
                room.polygon = operation.polygon
            if operation.name is not None:
                room.name = operation.name
            if operation.room_type is not None:
                room.type = operation.room_type
            room.provenance = "user_corrected"
        elif operation.type == "set_material" and room and operation.color:
            room.color, room.provenance = operation.color, "user_corrected"
        else:
            raise ValueError("Operation needs a matching object and all required fields.")
    candidate = Scene.model_validate(candidate.model_dump())
    refresh_quantities(candidate)
    return candidate
