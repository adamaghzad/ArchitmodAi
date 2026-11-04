import json

from app import planner, style_ranking, workflow
from app.catalog import CATALOG
from app.design_knowledge import (
    attach_profile,
    chosen_style,
    effective_needs,
    get_profile,
    profiles,
)
from app.geometry import validate_scene
from app.inference import InferenceError
from app.interior_brief import interior_brief
from app.models import Brief, FurnitureNeed, GenerateRequest, LayoutOrder, ProductAdvice


def room_scene(style="Japandi", budget=30000, prompt=""):
    return planner.solve_layout(
        GenerateRequest(
            expected_revision=0,
            width_m=5,
            depth_m=4,
            budget_mad=budget,
            style=style,
            prompt=prompt,
            rooms=[{"type": "bedroom", "min_area_m2": 20}],
        ),
        "style-test",
    )


def test_profiles_are_complete_and_aliases_preserve_saved_projects(client):
    assert [p.name for p in profiles()] == [
        "Scandinavian",
        "Japandi",
        "Korean Pastel",
        "Modern Minimalist",
        "Industrial",
    ]
    assert len(client.get("/api/design-styles").json()) == 5
    for profile in profiles():
        assert set(profile.room_templates) == {"office", "living", "bedroom", "kitchen", "bathroom"}
        assert profile.sources and profile.preferred_materials and profile.design_characteristics
        for items in profile.room_templates.values():
            assert any(item.priority == "essential" for item in items)
        assert all(key in CATALOG for key in profile.catalogue_affinities)
    assert get_profile("Warm minimal").id == "japandi"
    assert get_profile("Contemporary").id == "modern-minimalist"
    assert get_profile("Pastel").id == "korean-pastel"
    assert chosen_style("Industrial", "a cute pastel bedroom") == "Industrial"


def test_identical_geometry_produces_different_furniture_finishes_and_colours():
    scenes = []
    for profile in profiles():
        source = room_scene(profile.name)
        result = workflow.design_workflow.invoke(
            {"scene": source, "report": validate_scene(source), "use_semantic": False}
        )
        scene, report = result["scene"], result["report"]
        assert report.valid and report.total_mad <= source.budget_mad
        assert scene.rooms[0].polygon == source.rooms[0].polygon
        assert scene.design_brief.profile_id == profile.id
        assert report.completeness.user_requirements_complete
        assert report.completeness.template_items
        assert all(row.reason for row in report.completeness.items if row.placed < row.requested)
        assert any(CATALOG[item.product_id].category == "bed" for item in scene.furniture)
        scenes.append(scene)
    furniture = {tuple(sorted(item.product_id for item in scene.furniture)) for scene in scenes}
    surfaces = {tuple(sorted(item.product_id for item in scene.materials)) for scene in scenes}
    colours = {
        tuple(
            sorted(
                {(item.fabric_color, item.wood_color, item.light_color) for item in scene.furniture}
            )
        )
        for scene in scenes
    }
    assert len(furniture) == 5, furniture
    assert len(surfaces) >= 4, surfaces
    assert len(colours) == 5


def test_explicit_requests_override_template_quantities_exclusions_and_palette():
    scene = room_scene(
        "Industrial",
        prompt="A bedroom with a single bed, one bedside table, blush pink, light oak and no wardrobe.",
    )
    needs = {need.role: need for need in effective_needs(scene)}
    assert needs["bed"].name == "Single bed" and needs["bed"].origin == "user"
    assert needs["bedside_table"].quantity == 1 and "wardrobe" not in needs
    assert scene.style == "Industrial"
    assert scene.design_brief.palette == ["blush pink", "light oak"]
    from app.furnishing_solver import product_options, styled
    from app.models import Furniture

    assert all(
        p.width_m < 1.35
        for p in product_options(needs["bed"], scene.rooms[0], [], scene.style, scene)
    )
    item = styled(
        Furniture(id="test", product_id="single_bed", room_id=scene.rooms[0].id, position=(1, 1)),
        scene,
    )
    assert item.fabric_color == "#d9aeb6" and item.wood_color == "#e2cba6"
    report = validate_scene(scene).completeness
    assert any(
        row.validation_status == "overridden" and "Excluded" in row.reason
        for row in report.template_items
    )
    scene.design_brief = interior_brief("Office without decorative plants", room_types=["office"])
    scene.rooms[0].type = "office"
    attach_profile(scene)
    assert "plant" not in {need.role for need in effective_needs(scene)}
    scene.design_brief = interior_brief(
        "Office with two desks, three office chairs and no plants.", room_types=["office"]
    )
    attach_profile(scene)
    needs = {need.role: need for need in effective_needs(scene)}
    assert needs["desk"].quantity == 2 and needs["chair"].quantity == 3 and "plant" not in needs


def test_semantic_scores_influence_soft_ranking_but_never_rescue_hard_failures(monkeypatch):
    scene = room_scene(budget=1000)
    room = scene.rooms[0]
    original = CATALOG["nightstand"]
    a = original.model_copy(update={"id": "a"})
    b = original.model_copy(update={"id": "b"})
    oversized = original.model_copy(update={"id": "huge", "width_m": 50, "depth_m": 50})
    expensive = original.model_copy(update={"id": "costly", "price_mad": 1001})
    incompatible = original.model_copy(update={"id": "wrong-room", "room_types": ["bathroom"]})
    ranked = style_ranking.rank_products(
        scene,
        room,
        [a, b, oversized, expensive, incompatible],
        {"a": 0, "b": 1, "huge": 1, "costly": 1, "wrong-room": 1},
    )
    assert [row["product_id"] for row in ranked] == ["b", "a"]
    reversed_rows = style_ranking.rank_products(scene, room, [a, b], {"a": 1, "b": 0})
    assert reversed_rows[0]["product_id"] == "a"
    monkeypatch.setenv("ARCHAI_EMBEDDINGS_ENABLED", "true")
    monkeypatch.setattr(
        style_ranking, "catalogue_vectors", lambda *_: [[1.0, 0.0]] * len(style_ranking.PRODUCTS)
    )
    monkeypatch.setattr(style_ranking, "query_vector", lambda *_: [1.0, 0.0])
    values, metadata = style_ranking.semantic_scores(scene, room, True)
    assert metadata["status"] == "used" and metadata["dimensions"] == 2
    assert all(value == 1 for value in values.values())

    def unavailable(*_):
        raise InferenceError("Configured local embedding model unavailable")

    monkeypatch.setattr(style_ranking, "query_vector", unavailable)
    values, metadata = style_ranking.semantic_scores(scene, room, True)
    assert not values and metadata["status"] == "fallback" and "unavailable" in metadata["reason"]


def test_agents_receive_retrieved_profile_and_explicit_requirements(monkeypatch):
    received = {}

    def infer(role, schema, _system, payload):
        data = json.loads(payload)
        received[role] = data
        if schema is Brief:
            return Brief(
                rooms=[{"type": "bedroom", "min_area_m2": 20}],
                furniture=[FurnitureNeed(role="bed", name="Single bed", quantity=1)],
            )
        if schema is LayoutOrder:
            return LayoutOrder(room_indices=[0])
        assert schema is ProductAdvice
        return ProductAdvice(product_ids=[], explanations=[])

    monkeypatch.setattr(planner, "structured", infer)
    monkeypatch.setattr(workflow, "structured", infer)
    req = GenerateRequest(
        expected_revision=0,
        width_m=5,
        depth_m=4,
        budget_mad=30000,
        style="Modern Minimalist",
        prompt="A bedroom with a single bed",
        use_model=True,
        rooms=[{"type": "bedroom", "min_area_m2": 20}],
    )
    scene = planner.solve_layout(req, "agent-profile")
    selected = workflow.choose_products(
        {"scene": scene, "report": validate_scene(scene), "use_ai": True, "use_semantic": False}
    )
    workflow.apply_materials(
        {"scene": selected["scene"], "report": validate_scene(scene), "use_ai": True}
    )
    for role in ["requirements", "furniture", "materials"]:
        assert received[role]["style_profile"]["id"] == "modern-minimalist"
    assert received["furniture"]["style_profile"]["room_type"] == "bedroom"
    assert received["furniture"]["original_brief"]["needs"][0]["origin"] == "user"
    event = next(
        event for event in selected["scene"].design_trace if event["stage"] == "profile_retrieval"
    )
    assert event["semantic"]["status"] == "disabled" and event["ranking"][0][
        "components"
    ].keys() == {"style", "dimensions", "budget", "semantic"}


def test_insufficient_budget_reports_template_gaps_and_keeps_essential_bed():
    source = room_scene("Korean Pastel", budget=6000)
    result = workflow.design_workflow.invoke(
        {"scene": source, "report": validate_scene(source), "use_semantic": False}
    )
    report = result["report"]
    assert report.valid and report.total_mad <= 6000
    assert any(CATALOG[item.product_id].category == "bed" for item in result["scene"].furniture)
    assert not report.completeness.complete
    assert all(
        row.placed == row.requested
        for row in report.completeness.items
        if row.priority == "essential"
    ), report.completeness.model_dump()
    assert any(
        row.reason and row.origin == "template"
        for row in report.completeness.items
        if row.placed < row.requested
    )
    assert report.completeness.correction_attempts <= 2


def test_model_echo_of_profile_is_not_promoted_to_user_demands(monkeypatch):
    def infer(_role, schema, _system, _payload):
        return (
            Brief(
                rooms=[{"type": "bedroom", "min_area_m2": 20}],
                palette=["warm grey", "rust"],
                materials=["wood", "metal", "silk curtains"],
            )
            if schema is Brief
            else LayoutOrder(room_indices=[0])
        )

    monkeypatch.setattr(planner, "structured", infer)
    request = GenerateRequest(
        expected_revision=0,
        width_m=5,
        depth_m=4,
        budget_mad=30000,
        style="Industrial",
        rooms=[{"type": "bedroom", "min_area_m2": 20}],
        prompt="A bedroom with metal details and silk curtains.",
        use_model=True,
    )
    scene = planner.solve_layout(request, "profile-echo")
    assert scene.design_brief.palette == []
    assert scene.design_brief.materials == ["metal", "silk curtains"]
    assert get_profile(scene.style).preferred_materials  # Preferences remain retrievable.
