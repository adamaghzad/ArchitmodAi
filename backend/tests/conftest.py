import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import GenerateRequest, RoomRequirement


@pytest.fixture(autouse=True)
def isolated_inference(monkeypatch):
    monkeypatch.setenv("OLLAMA_REQUIREMENTS_MODEL", "")


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as test_client:
        yield test_client


@pytest.fixture
def request_brief():
    return GenerateRequest(
        expected_revision=0,
        width_m=8,
        depth_m=6,
        rooms=[
            RoomRequirement(type="living", min_area_m2=16),
            RoomRequirement(type="bedroom", min_area_m2=12),
            RoomRequirement(type="kitchen", min_area_m2=8),
            RoomRequirement(type="bathroom", min_area_m2=4),
        ],
    )
