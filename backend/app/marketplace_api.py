import csv
import io
from typing import Literal

import numpy as np
import pymupdf
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from PIL import Image

from .catalog import CATALOG, PRODUCTS, search_products
from .cv import perception_provider
from .geometry import validate_scene
from .marketplace import add_product, compare_products, shopping_list
from .models import (
    AddProductRequest,
    AgentOperation,
    RecommendRequest,
    RemoveProductRequest,
    RevisionRequest,
    SuggestionDecision,
)
from .operations import apply_operations
from .recommendations import recommendation_workflow
from .repair import repair_candidate
from .store import ConflictError, ProjectStore


def marketplace_router(store: ProjectStore, assets):
    router = APIRouter(prefix="/api")

    def load(project_id: str, revision: int | None = None):
        project = store.get(project_id)
        if revision is not None and project.revision != revision:
            raise ConflictError("Project changed. Reopen it before applying marketplace changes.")
        scene = project.candidate_scene or project.committed_scene
        if scene is None:
            raise HTTPException(422, "Generate a plan or calibrate a reference first.")
        return project, scene.model_copy(deep=True)

    @router.get("/products")
    def products(
        query: str = Query("", max_length=300),
        category: str | None = None,
        style: str | None = None,
        material: str | None = None,
        brand: str | None = None,
        color: str | None = None,
        min_price: float = Query(0, ge=0),
        max_price: float | None = Query(None, ge=0),
        width: float | None = Query(None, gt=0),
        depth: float | None = Query(None, gt=0),
        height: float | None = Query(None, gt=0),
        kind: Literal["furniture", "material"] | None = None,
        room_type: str | None = None,
        semantic: bool = False,
        sort: Literal["name", "price_asc", "price_desc", "relevance"] = "name",
    ):
        return search_products(
            query,
            category,
            style,
            material,
            brand,
            color,
            min_price,
            max_price,
            width,
            depth,
            height,
            kind,
            room_type,
            semantic,
            sort,
        )

    @router.get("/products/compare")
    def compare(
        ids: str,
        project_id: str | None = None,
        room_id: str | None = None,
        replace_id: str | None = None,
    ):
        scene = load(project_id)[1] if project_id else None
        return compare_products(ids.split(","), scene, room_id, replace_id)

    @router.get("/products/{product_id}")
    def product(product_id: str):
        if product_id not in CATALOG:
            raise HTTPException(404, "Product not found.")
        return CATALOG[product_id]

    @router.get("/catalogue/providers")
    def providers():
        return {
            "active": "local_sample",
            "products": len(PRODUCTS),
            "mock_data": True,
            "targets": [
                {
                    "name": "IKEA Morocco",
                    "homepage": "https://www.ikea.com/ma/fr/",
                    "connected": False,
                },
                {"name": "KITEA", "homepage": "https://www.kitea.com/", "connected": False},
                {"name": "Bricoma", "homepage": "https://www.bricoma.ma/", "connected": False},
            ],
            "note": "Authorized feeds only. No scraping or stock synchronization is configured.",
        }

    @router.post("/projects/{project_id}/products")
    def select_product(project_id: str, request: AddProductRequest):
        project, scene = load(project_id, request.expected_revision)
        candidate = add_product(scene, request)
        project.candidate_scene = candidate
        project.report = validate_scene(candidate)
        return store.save(project, request.expected_revision)

    @router.post("/projects/{project_id}/remove-product")
    def remove_product(project_id: str, request: RemoveProductRequest):
        project, scene = load(project_id, request.expected_revision)
        if not any(item.id == request.object_id for item in [*scene.furniture, *scene.materials]):
            raise HTTPException(404, "Selected item not found.")
        if any(item.id == request.object_id for item in scene.furniture):
            scene = apply_operations(
                scene, [AgentOperation(type="remove_furniture", object_id=request.object_id)]
            )
        scene.materials = [item for item in scene.materials if item.id != request.object_id]
        project.candidate_scene = scene
        project.report = validate_scene(scene)
        return store.save(project, request.expected_revision)

    @router.get("/projects/{project_id}/products")
    def selected_products(project_id: str):
        return shopping_list(load(project_id)[1])["items"]

    @router.get("/projects/{project_id}/shopping-list")
    def shopping(project_id: str):
        return shopping_list(load(project_id)[1])

    @router.get("/projects/{project_id}/shopping-list/export")
    def export_shopping(project_id: str, format: Literal["csv", "pdf"] = "csv"):
        project, scene = load(project_id)
        listing = shopping_list(scene)
        headers = [
            "Product",
            "Room",
            "Quantity",
            "Unit",
            "Dimensions (m)",
            "Unit price (MAD)",
            "Subtotal (MAD)",
            "Price status",
            "Source",
        ]
        names = {room.id: room.name for room in scene.rooms}
        rows = [
            [
                item["name"],
                names[item["room_id"]],
                item["quantity"],
                item["unit"],
                f"{item['width_m']} x {item['depth_m']} x {item['height_m']}",
                item["unit_price_mad"],
                item["subtotal_mad"],
                item["price_status"],
                item["source_provider"],
            ]
            for item in listing["items"]
        ]
        if format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            for row in rows:
                writer.writerow(
                    [
                        "'" + value
                        if isinstance(value, str) and value.startswith(("=", "+", "-", "@"))
                        else value
                        for value in row
                    ]
                )
            writer.writerow(["TOTAL (MAD)", "", "", "", "", "", listing["total_mad"]])
            writer.writerow(
                ["SAMPLE PRICES ONLY; shipping, installation and unselected finishes excluded."]
            )
            data = ("\ufeff" + output.getvalue()).encode("utf-8")
            content_type = "text/csv; charset=utf-8"
        else:
            document = pymupdf.open()
            page = document.new_page()
            y = 40
            lines = [
                "ArchAI Studio - Shopping list",
                project.name,
                "Mock catalogue / simulated MAD prices. Not a merchant quotation.",
                "",
            ]
            for item in listing["items"]:
                lines.extend(
                    [
                        f"{item['name']} | {names[item['room_id']]} | {item['quantity']} {item['unit']} | {item['subtotal_mad']:.2f} MAD",
                        f"  {item['width_m']} x {item['depth_m']} x {item['height_m']} m | unit {item['unit_price_mad']:.2f} MAD | {item['price_status']}",
                    ]
                )
            lines.extend(
                [
                    "",
                    f"TOTAL: {listing['total_mad']:.2f} MAD",
                    f"Budget: {scene.budget_mad:.2f} MAD",
                    "Shipping, installation and unselected finishes excluded.",
                ]
            )
            for line in lines:
                if y > 790:
                    page = document.new_page()
                    y = 40
                page.insert_text((35, y), line[:110], fontsize=9)
                y += 17
            data = document.tobytes()
            document.close()
            content_type = "application/pdf"
        return Response(
            content=data,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="shopping-list.{format}"'},
        )

    @router.post("/projects/{project_id}/recommendations")
    def recommend(project_id: str, request: RecommendRequest):
        project, scene = load(project_id, request.expected_revision)
        if request.room_id and not any(room.id == request.room_id for room in scene.rooms):
            raise HTTPException(404, "Room not found.")
        if not validate_scene(scene).valid:
            raise HTTPException(422, "Resolve scene errors before requesting recommendations.")
        result = recommendation_workflow.invoke(
            {
                "scene": scene,
                "room_id": request.room_id,
                "use_ai": request.use_ai,
                "recommendations": [],
            }
        )
        project.recommendations = result["recommendations"]
        return store.save(project, request.expected_revision)

    @router.get("/projects/{project_id}/recommendations")
    def recommendations(project_id: str):
        return store.get(project_id).recommendations

    @router.post("/projects/{project_id}/recommendations/{suggestion_id}")
    def decide(project_id: str, suggestion_id: str, request: SuggestionDecision):
        project, scene = load(project_id, request.expected_revision)
        suggestion = next(
            (item for item in project.recommendations if item.id == suggestion_id), None
        )
        if suggestion is None or suggestion.status != "pending":
            raise HTTPException(422, "Select a pending recommendation.")
        if request.accept:
            scene = add_product(
                scene,
                AddProductRequest(
                    expected_revision=request.expected_revision,
                    product_id=suggestion.product_id,
                    room_id=suggestion.room_id,
                    surface=suggestion.surface or "floor",
                ),
            )
            project.candidate_scene = scene
            project.report = validate_scene(scene)
        suggestion.status = "accepted" if request.accept else "rejected"
        return store.save(project, request.expected_revision)

    @router.post("/projects/{project_id}/analyze-plan")
    def analyze_plan(project_id: str, request: RevisionRequest):
        project = store.get(project_id)
        if project.revision != request.expected_revision:
            raise ConflictError("Project changed. Reopen before analyzing.")
        if project.reference is None:
            raise HTTPException(422, "Import a plan reference first.")
        image = np.asarray(
            Image.open(assets / project.reference.url.rsplit("/", 1)[-1]).convert("RGB")
        )
        project.perception = perception_provider().analyze(image).model_dump()
        return store.save(project, request.expected_revision)

    @router.post("/projects/{project_id}/repair")
    def repair(project_id: str, request: RevisionRequest):
        project, scene = load(project_id, request.expected_revision)
        project.candidate_scene = repair_candidate(scene)
        project.report = validate_scene(project.candidate_scene)
        return store.save(project, request.expected_revision)

    return router
