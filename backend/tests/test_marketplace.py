import csv
import io

import pymupdf

from app import catalog
from app.catalog import CATALOG, PRODUCTS, search_products
from app.geometry import validate_scene
from app.marketplace import add_product, shopping_list
from app.materials import material_selection
from app.models import AddProductRequest
from app.planner import solve_layout


def test_catalogue_contains_fifty_honest_mock_records():
    assert len(PRODUCTS) == 52
    assert len(CATALOG) == 52
    assert any(product.kind == "material" for product in PRODUCTS)
    assert all(
        product.mock_data
        and product.product_url is None
        and product.availability_status == "mock_data"
        for product in PRODUCTS
    )
    assert all(product.price_mad >= 0 and product.width_m > 0 for product in PRODUCTS)


def test_search_filters_and_sorts_stored_product_data():
    results = search_products(
        query="oak",
        style="Warm minimal",
        material="oak",
        brand="mock",
        min_price=500,
        max_price=2000,
        sort="price_asc",
    )
    assert results
    assert all(
        500 <= product.price_mad <= 2000 and product.material == "oak" for product in results
    )
    assert [product.price_mad for product in results] == sorted(
        product.price_mad for product in results
    )
    rotated = search_products(category="desk", width=0.7, depth=1.3)
    assert "sample_desk" in {product.id for product in rotated}
    assert all(product.height_m <= 0.8 for product in search_products(height=0.8))


def test_semantic_search_ranks_only_hard_filtered_products(monkeypatch):
    def embeddings(texts):
        return [
            [1.0, 0.0]
            if text == "a place to relax" or text.startswith("Linen sofa.")
            else [0.0, 1.0]
            for text in texts
        ]

    monkeypatch.setattr(catalog, "embed_texts", embeddings)
    catalog.catalogue_vectors.cache_clear()
    assert (
        search_products(query="a place to relax", category="sofa", semantic=True)[0].id
        == "sample_sofa"
    )
    assert "sample_sofa" not in {
        product.id
        for product in search_products(query="a place to relax", max_price=3000, semantic=True)
    }
    catalog.catalogue_vectors.cache_clear()


def test_material_quantities_and_costs_follow_coverage_and_waste(request_brief):
    scene = solve_layout(request_brief, "materials")
    room = scene.rooms[0]
    product = CATALOG["oak_floor"]
    selection = material_selection(scene, product, room.id, "floor", 0.1)
    assert selection.area_m2 == 16
    assert selection.units == 10
    scene.materials.append(selection)
    report = validate_scene(scene)
    assert report.valid
    assert report.materials_total_mad == report.total_mad == 2400
    scene.materials[0].units = 1
    assert "material_quantity" in {issue.code for issue in validate_scene(scene).issues}


def test_add_replace_remove_and_compare_use_room_geometry(client, request_brief):
    project = client.post("/api/projects", json={"name": "Marketplace test"}).json()
    path = f"/api/projects/{project['id']}"
    project = client.post(path + "/generate-plan", json=request_brief.model_dump()).json()
    room_id = project["candidate_scene"]["rooms"][0]["id"]
    project = client.post(
        path + "/products",
        json={
            "expected_revision": project["revision"],
            "product_id": "sample_sofa",
            "room_id": room_id,
        },
    ).json()
    assert project["report"]["total_mad"] == 4800
    old_id = project["candidate_scene"]["furniture"][0]["id"]
    response = client.get(
        "/api/products/compare",
        params={
            "ids": "small_sofa,sample_sofa",
            "project_id": project["id"],
            "room_id": room_id,
            "replace_id": old_id,
        },
    )
    assert response.status_code == 200
    assert all(row["fits_room_dimensions"] and row["can_place_now"] for row in response.json())
    project = client.post(
        path + "/products",
        json={
            "expected_revision": project["revision"],
            "product_id": "small_sofa",
            "room_id": room_id,
            "replace_id": old_id,
        },
    ).json()
    assert len(project["candidate_scene"]["furniture"]) == 1
    assert project["report"]["total_mad"] == 2200
    project = client.post(
        path + "/remove-product",
        json={
            "expected_revision": project["revision"],
            "object_id": project["candidate_scene"]["furniture"][0]["id"],
        },
    ).json()
    assert project["report"]["total_mad"] == 0
    assert client.get("/api/products/unknown").status_code == 404
    assert client.get("/api/products/compare", params={"ids": "invented"}).status_code == 422


def test_material_selection_shopping_list_and_exports(client, request_brief):
    project = client.post("/api/projects", json={"name": "Material exports"}).json()
    path = f"/api/projects/{project['id']}"
    project = client.post(path + "/generate-plan", json=request_brief.model_dump()).json()
    room_id = project["candidate_scene"]["rooms"][0]["id"]
    project = client.post(
        path + "/products",
        json={
            "expected_revision": project["revision"],
            "product_id": "oak_floor",
            "room_id": room_id,
            "surface": "floor",
        },
    ).json()
    listing = client.get(path + "/shopping-list").json()
    assert listing["items"][0]["quantity"] == 10
    assert listing["sample_total_mad"] == listing["total_mad"] == 2400
    assert listing["confirmed_total_mad"] == 0
    csv_response = client.get(path + "/shopping-list/export?format=csv")
    rows = list(csv.reader(io.StringIO(csv_response.content.decode("utf-8-sig"))))
    assert rows[0][0] == "Product"
    assert rows[1][0] == "Natural oak laminate"
    pdf_response = client.get(path + "/shopping-list/export?format=pdf")
    with pymupdf.open(stream=pdf_response.content, filetype="pdf") as document:
        assert "simulated MAD prices" in document[0].get_text()
        assert "2400.00 MAD" in document[0].get_text()


def test_over_budget_shopping_list_offers_a_cheaper_fitting_alternative(request_brief):
    scene = solve_layout(request_brief, "budget")
    scene.budget_mad = 1000
    scene = add_product(
        scene,
        AddProductRequest(expected_revision=0, product_id="sample_sofa", room_id=scene.rooms[0].id),
    )
    listing = shopping_list(scene)
    assert listing["over_budget_mad"] == 3800
    assert listing["alternatives"]
    assert listing["alternatives"][0]["saving_mad"] > 0


def test_cheaper_material_alternatives_compare_required_quantities(request_brief):
    scene = solve_layout(request_brief, "material-budget")
    scene.budget_mad = 1000
    scene = add_product(
        scene,
        AddProductRequest(expected_revision=0, product_id="oak_floor", room_id=scene.rooms[0].id),
    )
    alternatives = shopping_list(scene)["alternatives"]
    assert alternatives and alternatives[0]["surface"] == "floor"
    assert alternatives[0]["saving_mad"] > 0


def test_suggestions_are_reviewed_before_affecting_the_scene(client, request_brief):
    project = client.post("/api/projects", json={"name": "Suggestions"}).json()
    path = f"/api/projects/{project['id']}"
    project = client.post(path + "/generate-plan", json=request_brief.model_dump()).json()
    room_id = project["candidate_scene"]["rooms"][0]["id"]
    response = client.post(
        path + "/recommendations",
        json={"expected_revision": project["revision"], "room_id": room_id},
    )
    assert response.status_code == 200, response.text
    project = response.json()
    assert len(project["recommendations"]) >= 2
    assert project["candidate_scene"]["furniture"] == []
    suggestion = project["recommendations"][0]
    project = client.post(
        path + f"/recommendations/{suggestion['id']}",
        json={"expected_revision": project["revision"], "accept": True},
    ).json()
    assert len(project["candidate_scene"]["furniture"]) == 1
    assert project["recommendations"][0]["status"] == "accepted"
    rejected = project["recommendations"][1]
    result = client.post(
        path + f"/recommendations/{rejected['id']}",
        json={"expected_revision": project["revision"], "accept": False},
    ).json()
    assert result["recommendations"][1]["status"] == "rejected"
    assert len(result["candidate_scene"]["furniture"]) == 1
    request_brief.expected_revision = result["revision"]
    regenerated = client.post(path + "/generate-plan", json=request_brief.model_dump())
    assert regenerated.status_code == 200
    assert regenerated.json()["recommendations"] == []
