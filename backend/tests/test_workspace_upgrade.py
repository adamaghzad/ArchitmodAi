import json

from app.geometry import validate_scene
from app.models import Furniture, Opening, ProductAdvice, Room, Scene, Wall


def apartment(client, request_brief):
    project = client.post("/api/projects", json={"name": "Workspace regression"}).json()
    response = client.post(
        f"/api/projects/{project['id']}/generate-plan", json=request_brief.model_dump()
    )
    assert response.status_code == 200
    return response.json()


def test_door_swing_and_actual_wall_thickness_are_validated():
    scene = Scene(
        id="door",
        width_m=5,
        depth_m=4,
        rooms=[
            Room(id="r", name="Living", type="living", polygon=[(0, 0), (5, 0), (5, 4), (0, 4)])
        ],
        walls=[
            Wall(id="top", start=(0, 0), end=(5, 0)),
            Wall(id="right", start=(5, 0), end=(5, 4)),
            Wall(id="bottom", start=(0, 4), end=(5, 4)),
            Wall(id="left", start=(0, 0), end=(0, 4)),
        ],
        openings=[Opening(id="door", type="door", wall_id="top", offset_m=2, width_m=0.9)],
    )
    item = Furniture(id="table", product_id="sample_table", room_id="r", position=(2.1, 0.15))
    scene.furniture = [item]
    report = validate_scene(scene)
    issue = next(issue for issue in report.issues if issue.code == "door_obstruction")
    assert issue.object_id == "table" and issue.related_object_ids == ["door"]
    item.position = (0.01, 2)
    assert "furniture_wall_collision" in {issue.code for issue in validate_scene(scene).issues}
    item.position = (0.25, 2)
    assert validate_scene(scene).valid


def test_undo_redo_is_persisted_and_a_new_change_discards_redo(client, request_brief):
    project = apartment(client, request_brief)
    path = f"/api/projects/{project['id']}"
    project = client.post(
        path + "/design-interior", json={"expected_revision": project["revision"]}
    ).json()
    furniture = project["candidate_scene"]["furniture"]
    assert furniture and project["undo_stack"]
    undone = client.post(path + "/undo", json={"expected_revision": project["revision"]}).json()
    assert undone["candidate_scene"]["furniture"] == []
    assert client.get(path).json()["redo_stack"]
    redone = client.post(path + "/redo", json={"expected_revision": undone["revision"]}).json()
    assert redone["candidate_scene"]["furniture"] == furniture
    undone = client.post(path + "/undo", json={"expected_revision": redone["revision"]}).json()
    edited = client.post(
        path + "/brief",
        json={
            "expected_revision": undone["revision"],
            "budget_mad": 25000,
            "style": "Contemporary",
        },
    ).json()
    assert edited["redo_stack"] == []
    assert (
        client.post(path + "/redo", json={"expected_revision": edited["revision"]}).status_code
        == 422
    )
    assert (
        client.post(path + "/undo", json={"expected_revision": undone["revision"]}).status_code
        == 409
    )


def test_snapshots_restore_to_a_draft_without_replacing_the_current_approved_scene(
    client, request_brief
):
    project = apartment(client, request_brief)
    path = f"/api/projects/{project['id']}"
    project = client.post(path + "/approve", json={"expected_revision": project["revision"]}).json()
    first_revision = project["revision"]
    project = client.post(
        path + "/brief",
        json={
            "expected_revision": project["revision"],
            "budget_mad": 30000,
            "style": "Scandinavian",
        },
    ).json()
    project = client.post(path + "/approve", json={"expected_revision": project["revision"]}).json()
    assert not project["undo_stack"]
    snapshots = client.get(path + "/snapshots").json()
    assert len(snapshots) == 2
    assert all(snapshot["approved_at"] for snapshot in snapshots)
    restored = client.post(
        path + f"/snapshots/{first_revision}/restore",
        json={"expected_revision": project["revision"]},
    ).json()
    assert restored["candidate_scene"]["budget_mad"] == 20000
    assert restored["committed_scene"]["budget_mad"] == 30000


def test_opening_and_wall_edits_are_validated_and_undoable(client, request_brief):
    project = apartment(client, request_brief)
    path = f"/api/projects/{project['id']}"
    opening = project["candidate_scene"]["openings"][0]
    updated = client.post(
        path + "/operations",
        json={
            "expected_revision": project["revision"],
            "type": "update_opening",
            "object_id": opening["id"],
            "width_m": 20,
        },
    ).json()
    assert not updated["report"]["valid"]
    assert (
        client.post(path + "/approve", json={"expected_revision": updated["revision"]}).status_code
        == 422
    )
    restored = client.post(path + "/undo", json={"expected_revision": updated["revision"]}).json()
    assert restored["candidate_scene"]["openings"][0] == opening
    assert restored["report"]["valid"]


def test_ai_furnishing_uses_stored_products_and_only_creates_a_candidate(
    client, request_brief, monkeypatch
):
    from app import workflow

    calls = []

    def choose(role, schema, system, prompt):
        data = json.loads(prompt)
        product = data["products"][0]
        calls.append(role)
        return ProductAdvice(
            product_ids=[product["id"]], explanations=["Stored product fits the room type."]
        )

    monkeypatch.setattr(workflow, "structured", choose)
    project = apartment(client, request_brief)
    path = f"/api/projects/{project['id']}"
    response = client.post(
        path + "/design-interior", json={"expected_revision": project["revision"], "use_ai": True}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["candidate_scene"]["furniture"]
    assert result["committed_scene"] is None and result["report"]["valid"]
    assert calls == ["furniture"] * 4
    assert any(note.startswith("AI furnishing:") for note in result["candidate_scene"]["notes"])


def test_replacement_preserves_position_when_the_new_product_fits(client, request_brief):
    project = apartment(client, request_brief)
    path = f"/api/projects/{project['id']}"
    room = project["candidate_scene"]["rooms"][0]["id"]
    project = client.post(
        path + "/products",
        json={
            "expected_revision": project["revision"],
            "room_id": room,
            "product_id": "sample_sofa",
        },
    ).json()
    before = project["candidate_scene"]["furniture"][0]
    result = client.post(
        path + "/products",
        json={
            "expected_revision": project["revision"],
            "room_id": room,
            "product_id": "small_sofa",
            "replace_id": before["id"],
        },
    ).json()
    after = result["candidate_scene"]["furniture"][0]
    assert (
        after["id"] == before["id"]
        and after["position"] == before["position"]
        and after["rotation_deg"] == before["rotation_deg"]
    )
    assert after["product_id"] == "small_sofa"


def test_wall_height_changes_refresh_material_quantities_and_budget(client, request_brief):
    project = apartment(client, request_brief)
    path = f"/api/projects/{project['id']}"
    room_id = project["candidate_scene"]["rooms"][0]["id"]
    project = client.post(
        path + "/products",
        json={
            "expected_revision": project["revision"],
            "product_id": "warm_paint",
            "room_id": room_id,
            "surface": "walls",
        },
    ).json()
    before = project["candidate_scene"]["materials"][0]
    wall = project["candidate_scene"]["walls"][0]
    result = client.post(
        path + "/operations",
        json={
            "expected_revision": project["revision"],
            "type": "update_wall",
            "object_id": wall["id"],
            "height": 5,
        },
    ).json()
    after = result["candidate_scene"]["materials"][0]
    assert after["id"] == before["id"] and after["area_m2"] > before["area_m2"]
    assert after["units"] > before["units"] and result["report"]["valid"]
    assert result["report"]["total_mad"] > project["report"]["total_mad"]
