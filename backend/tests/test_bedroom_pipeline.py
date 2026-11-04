from app import planner, workflow
from app.catalog import CATALOG
from app.geometry import footprint, validate_scene
from app.interior_brief import interior_brief
from app.models import Brief, FurnitureNeed, GenerateRequest, LayoutOrder, ProductAdvice

PROMPT = (
    "A cute pastel bedroom with a double bed with upholstered headboard, two bedside tables, "
    "vanity desk and mirror, wardrobe, reading armchair, small bookshelf, rug, two lamps "
    "and two decorative plants. Blush pink, warm cream, sage green, light oak, soft fabrics "
    "and warm natural lighting."
)


def request(budget=20000):
    return GenerateRequest(
        expected_revision=0,
        width_m=5,
        depth_m=4,
        budget_mad=budget,
        prompt=PROMPT,
        rooms=[{"type": "bedroom", "min_area_m2": 20}],
    )


def test_room_only_model_answer_cannot_erase_quantities_or_palette(monkeypatch):
    calls = []

    def inference(role, schema, _system, _prompt):
        calls.append(role)
        return Brief(rooms=request().rooms) if schema is Brief else LayoutOrder(room_indices=[0])

    monkeypatch.setattr(planner, "structured", inference)
    req = request()
    req.use_model = True
    scene = planner.solve_layout(req, "quantities")
    needs = {need.role: need.quantity for need in scene.design_brief.furniture}
    assert needs["bedside_table"] == needs["lamp"] == needs["plant"] == 2
    assert len(needs) == 10 and scene.style == "Pastel"
    assert scene.design_brief.prompt == PROMPT and calls == ["requirements", "design"]
    assert "wardrobe" not in {
        need.role for need in interior_brief("cute pastel bedroom without a wardrobe").furniture
    }
    normalized = interior_brief(
        PROMPT,
        Brief(
            rooms=request().rooms,
            materials=["natural wood (light oak)", "soft upholstery", "silk curtains"],
        ),
    )
    assert (
        "light oak" in normalized.materials
        and "natural wood (light oak)" not in normalized.materials
    )
    assert "silk curtains" in normalized.materials  # Unsupported preferences remain reportable.


def test_bed_selection_respects_single_size_and_other_styles():
    from app.furnishing_solver import product_options
    from app.models import Room

    room = Room(id="room", type="bedroom", name="Bedroom", polygon=[(0, 0), (5, 0), (5, 4), (0, 4)])
    single = interior_brief("A bedroom with a single bed").furniture[0]
    assert all(
        product.width_m < 1.35 for product in product_options(single, room, [], "Scandinavian")
    )
    double = FurnitureNeed(role="bed", name="Double bed")
    assert product_options(double, room, [], "Warm minimal")[0].id == "sample_bed"
    from app.interior_brief import matches_role

    assert not matches_role(CATALOG["single_bed"], "bed", "Double bed")
    assert any(
        need.role == "aquarium"
        for need in interior_brief("A pastel bedroom with a double bed and aquarium").furniture
    )


def test_bedroom_completeness_geometry_supports_and_idempotence():
    original = planner.solve_layout(request(), "complete")
    result = workflow.design_workflow.invoke(
        {"scene": original, "report": validate_scene(original)}
    )
    scene, report = result["scene"], result["report"]
    assert report.valid and report.completeness.complete, report.model_dump()
    assert report.completeness.requested_count == report.completeness.placed_count == 13
    assert len(scene.furniture) == 12
    lamps = [item for item in scene.furniture if item.product_id == "bed_lamp"]
    assert len(lamps) == 2 and len({item.support_id for item in lamps}) == 2
    for lamp in lamps:
        support = next(item for item in scene.furniture if item.id == lamp.support_id)
        assert footprint(support).covers(footprint(lamp))
        assert lamp.elevation_m == CATALOG[support.product_id].height_m
    assert {selection.product_id for selection in scene.materials} == {
        "pastel_oak_floor",
        "warm_paint",
    }
    assert scene.rooms[0].color == CATALOG["pastel_oak_floor"].color
    assert original.furniture == [] and original.design_trace == []
    repeated = workflow.design_workflow.invoke({"scene": scene, "report": report})
    assert repeated["scene"].furniture == scene.furniture
    assert repeated["report"].completeness.complete
    # Validation derives completeness afresh after an edit, not from a cached success.
    scene.furniture = [item for item in scene.furniture if item.product_id != "potted_plant"]
    assert not validate_scene(scene).completeness.complete
    row = next(
        row for row in validate_scene(scene).completeness.items if row.name == "Decorative plants"
    )
    assert row.placed == 0 and row.reason


def test_budget_and_unsupported_requests_keep_valid_items_and_stop_correction():
    scene = planner.solve_layout(request(4500), "limited")
    scene.design_brief.furniture.append(FurnitureNeed(role="piano", name="Piano"))
    result = workflow.design_workflow.invoke({"scene": scene, "report": validate_scene(scene)})
    report = result["report"]
    assert report.valid and report.total_mad <= 4500
    assert any(CATALOG[item.product_id].category == "bed" for item in result["scene"].furniture)
    assert not report.completeness.complete and report.completeness.correction_attempts == 2
    assert all(row.reason for row in report.completeness.items if row.placed < row.requested)
    assert "catalogue" in next(
        row.reason for row in report.completeness.items if row.name == "Piano"
    )
    assert any("budget" in row.reason.lower() for row in report.completeness.items if row.reason)


def test_sparse_furniture_agent_ranking_does_not_limit_explicit_requirements(monkeypatch):
    scene = planner.solve_layout(request(), "agent")
    calls = []

    def advice(role, _schema, _system, _prompt):
        calls.append(role)
        return ProductAdvice(
            product_ids=["pastel_double_bed"]
            if role == "furniture"
            else ["pastel_oak_floor", "warm_paint"],
            explanations=["Stored catalogue choice"]
            if role == "furniture"
            else ["Oak floor", "Cream paint"],
        )

    monkeypatch.setattr(workflow, "structured", advice)
    result = workflow.design_workflow.invoke(
        {"scene": scene, "report": validate_scene(scene), "use_ai": True}
    )
    assert result["report"].completeness.complete
    assert calls == ["furniture", "materials"]
    assert {event["stage"] for event in result["scene"].design_trace} >= {
        "requirements",
        "selection",
        "placement",
        "materials",
        "validation",
    }


def test_generate_endpoint_preserves_brief_and_returns_furnished_candidate(client):
    project = client.post("/api/projects", json={"name": "Pastel acceptance"}).json()
    response = client.post(
        f"/api/projects/{project['id']}/generate-plan",
        json={**request().model_dump(), "furnish": True},
    )
    assert response.status_code == 200, response.text
    project = response.json()
    assert project["committed_scene"] is None
    assert project["report"]["completeness"]["complete"]
    assert project["candidate_scene"]["design_brief"]["prompt"] == PROMPT


def test_supported_lamp_moves_with_table_and_invalid_support_is_reported():
    from app.marketplace import add_product, position_for
    from app.models import AddProductRequest, AgentOperation, Furniture
    from app.operations import apply_operations

    scene = planner.solve_layout(request(), "support")
    table = Furniture(
        id="side", product_id="white_nightstand", room_id="room_1", position=(0.3, 0.3)
    )
    scene.furniture.append(table)
    lamp = position_for(scene, CATALOG["bed_lamp"], "room_1")
    assert lamp is not None
    scene.furniture.append(lamp)
    moved = apply_operations(
        scene, [AgentOperation(type="move_furniture", object_id="side", position=(1, 0.3))]
    )
    assert validate_scene(moved).valid
    assert moved.furniture[1].position[0] == lamp.position[0] + 0.7
    replaced = add_product(
        moved,
        AddProductRequest(
            expected_revision=0, product_id="nightstand", room_id="room_1", replace_id="side"
        ),
    )
    assert validate_scene(replaced).valid
    assert replaced.furniture[0].elevation_m == CATALOG["nightstand"].height_m
    # Removing the support removes its mounted lamp, never leaving a floating mesh.
    removed = apply_operations(moved, [AgentOperation(type="delete_furniture", object_id="side")])
    assert not removed.furniture
    assert any(event.get("reason", "").startswith("Mounted lamp") for event in removed.design_trace)
    scene.furniture[1].position = (3.5, 0.3)
    assert any(issue.code == "invalid_support" for issue in validate_scene(scene).issues)
