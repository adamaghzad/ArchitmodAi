import io

import pymupdf
import pytest
from PIL import Image

from app.planner import PlanningError, interpret_brief
from app.store import ProjectStore


def new_project(client):
    response = client.post("/api/projects", json={"name": "Test apartment"})
    assert response.status_code == 201
    return response.json()


def generate(client, project, request_brief):
    response = client.post(
        f"/api/projects/{project['id']}/generate-plan", json=request_brief.model_dump()
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_generate_furnish_approve_reopen_and_stale_revision(client, request_brief):
    project = generate(client, new_project(client), request_brief)
    path = f"/api/projects/{project['id']}"
    assert project["committed_scene"] is None
    project = client.post(path + "/design-interior", json={"expected_revision": 1}).json()
    assert project["candidate_scene"]["furniture"]
    assert project["report"]["valid"]
    stale = client.post(path + "/approve", json={"expected_revision": 1})
    assert stale.status_code == 409
    approved = client.post(path + "/approve", json={"expected_revision": 2})
    assert approved.status_code == 200
    project = approved.json()
    assert project["candidate_scene"] is None
    assert project["committed_scene"]["furniture"]
    assert client.get(path).json() == project
    assert client.get("/api/projects").json()[0] == project


def test_invalid_draft_does_not_change_approved_scene_and_discard_restores(client, request_brief):
    project = generate(client, new_project(client), request_brief)
    path = f"/api/projects/{project['id']}"
    project = client.post(
        path + "/design-interior", json={"expected_revision": project["revision"]}
    ).json()
    project = client.post(path + "/approve", json={"expected_revision": project["revision"]}).json()
    committed = project["committed_scene"]
    item = committed["furniture"][0]
    response = client.post(
        path + "/operations",
        json={
            "type": "move_furniture",
            "object_id": item["id"],
            "position": [-3, -3],
            "expected_revision": project["revision"],
        },
    )
    assert response.status_code == 200
    draft = response.json()
    assert not draft["report"]["valid"]
    assert draft["committed_scene"] == committed
    assert (
        client.post(path + "/approve", json={"expected_revision": draft["revision"]}).status_code
        == 422
    )
    restored = client.post(path + "/discard", json={"expected_revision": draft["revision"]}).json()
    assert restored["candidate_scene"] is None
    assert restored["committed_scene"] == committed
    assert restored["report"]["valid"]


def test_upload_calibration_invalid_content_and_delete(client):
    project = new_project(client)
    path = f"/api/projects/{project['id']}"
    invalid = client.post(
        path + "/upload-plan",
        data={"expected_revision": 0},
        files={"file": ("fake.png", b"not an image", "image/png")},
    )
    assert invalid.status_code == 422
    output = io.BytesIO()
    Image.new("RGB", (400, 300), "white").save(output, format="PNG")
    response = client.post(
        path + "/upload-plan",
        data={"expected_revision": 0},
        files={"file": ("plan.png", output.getvalue(), "image/png")},
    )
    assert response.status_code == 200
    project = response.json()
    assert project["candidate_scene"] is None
    reference_url = project["reference"]["url"]
    assert client.get(reference_url).status_code == 200
    calibration = {
        "expected_revision": project["revision"],
        "width_m": 8,
        "depth_m": 6,
        "scale_confirmed": False,
    }
    assert client.post(path + "/calibrate", json=calibration).status_code == 422
    calibration["scale_confirmed"] = True
    result = client.post(path + "/calibrate", json=calibration)
    assert result.status_code == 200
    assert result.json()["candidate_scene"]["rooms"][0]["name"] == "Review outline"
    assert client.delete(path).status_code == 204
    assert client.get(path).status_code == 404
    assert client.get(reference_url).status_code == 404


def test_pdf_page_selection_and_oversized_upload(client):
    project = new_project(client)
    path = f"/api/projects/{project['id']}"
    with pymupdf.open() as document:
        document.new_page(width=300, height=200)
        data = document.tobytes()
    assert (
        client.post(
            path + "/upload-plan",
            data={"expected_revision": 0, "page": 1},
            files={"file": ("plan.pdf", data)},
        ).status_code
        == 422
    )
    result = client.post(
        path + "/upload-plan",
        data={"expected_revision": 0, "page": 0},
        files={"file": ("plan.pdf", data)},
    )
    assert result.status_code == 200
    assert result.json()["reference"]["width_px"] == 600
    assert (
        client.post(
            path + "/upload-plan",
            data={"expected_revision": 1},
            files={"file": ("big.png", b"x" * (10 * 1024 * 1024 + 1))},
        ).status_code
        == 413
    )


def test_infeasible_plan_does_not_replace_existing_draft(client, request_brief):
    project = generate(client, new_project(client), request_brief)
    path = f"/api/projects/{project['id']}"
    request_brief.expected_revision = project["revision"]
    request_brief.width_m, request_brief.depth_m = 3, 3
    assert client.post(path + "/generate-plan", json=request_brief.model_dump()).status_code == 422
    assert client.get(path).json() == project


def test_unconfigured_model_is_explicit_and_bad_operations_are_rejected(
    client, monkeypatch, request_brief
):
    monkeypatch.setenv("OLLAMA_MODEL", "")
    with pytest.raises(PlanningError, match="not configured"):
        interpret_brief("two rooms")
    project = generate(client, new_project(client), request_brief)
    path = f"/api/projects/{project['id']}"
    assert (
        client.post(
            path + "/operations",
            json={
                "expected_revision": project["revision"],
                "type": "execute_code",
                "object_id": "test",
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            path + "/operations",
            json={
                "expected_revision": project["revision"],
                "type": "move_furniture",
                "object_id": "missing",
                "position": [0, 0],
            },
        ).status_code
        == 422
    )


def test_structured_model_response_is_validated(monkeypatch):
    from app import inference

    monkeypatch.setattr(inference, "installed_name", lambda _model: "test-model")

    class FakeChat:
        content = {"rooms": [{"type": "bedroom", "min_area_m2": 12}]}

        def __init__(self, **kwargs):
            assert kwargs["keep_alive"] == 0

        def with_structured_output(self, schema, method):
            assert method == "json_schema"
            return self

        def invoke(self, messages):
            return self.content

    monkeypatch.setattr(inference, "ChatOllama", FakeChat)
    assert interpret_brief("a bedroom")[0].type == "bedroom"
    FakeChat.content = {"rooms": [{"type": "invented", "min_area_m2": 12}]}
    with pytest.raises(PlanningError, match="Local inference failed"):
        interpret_brief("unknown")


def test_database_persists_and_rejects_stale_writes(tmp_path):
    path = tmp_path / "test.sqlite3"
    store = ProjectStore(path)
    project = store.create("Persistent project")
    stale = project.model_copy(deep=True)
    project.name = "Updated name"
    store.save(project, 0)
    from app.store import ConflictError

    with pytest.raises(ConflictError):
        store.save(stale, 0)
    assert ProjectStore(path).get(project.id).name == "Updated name"
