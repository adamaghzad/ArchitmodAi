import numpy as np
import pytest

from app import inference
from app.cv import OpenCVPipeline, perception_provider
from app.inference import InferenceError
from app.models import RepairAdvice, RepairMove
from app.planner import solve_layout
from app.repair import repair_candidate


def test_gpu_memory_failure_retries_once_on_cpu(monkeypatch):
    monkeypatch.setattr(inference, "installed_name", lambda _model: "installed-model")
    monkeypatch.setenv("OLLAMA_FORCE_CPU", "false")
    monkeypatch.setenv("OLLAMA_CPU_FALLBACK", "true")
    attempts = []

    def operation(model, gpu):
        attempts.append(gpu)
        if gpu is None:
            raise RuntimeError("CUDA out of memory")
        return model

    assert inference.execute("requirements", operation) == "installed-model"
    assert attempts == [None, 0]


def test_non_memory_failure_is_not_retried_or_hidden(monkeypatch):
    monkeypatch.setattr(inference, "installed_name", lambda _model: "installed-model")
    calls = []

    def operation(model, gpu):
        calls.append(model)
        raise RuntimeError("Connection refused")

    with pytest.raises(InferenceError, match="Local inference failed"):
        inference.execute("requirements", operation)
    assert len(calls) == 1


def test_opencv_returns_pixel_candidates_without_claiming_rooms():
    image = np.full((300, 400, 3), 255, dtype=np.uint8)
    image[30:35, 30:370] = 0
    image[265:270, 30:370] = 0
    image[30:270, 30:35] = 0
    image[30:270, 365:370] = 0
    result = OpenCVPipeline().analyze(image)
    assert result.provider == "opencv"
    assert len(result.wall_candidates) >= 4
    assert result.warnings
    assert all(
        0 <= point[0] <= 400 and 0 <= point[1] <= 300
        for line in result.wall_candidates
        for point in line
    )


def test_segmentation_interface_validates_a_locally_supplied_mask(monkeypatch):
    class BadSegmentation:
        def predict_wall_mask(self, _image):
            return np.ones((2, 2))

    with pytest.raises(ValueError, match="invalid wall mask"):
        OpenCVPipeline(BadSegmentation()).analyze(np.ones((100, 100, 3), dtype=np.uint8))
    monkeypatch.setenv("CV_PROVIDER", "segmentation")
    monkeypatch.setenv("CV_SEGMENTATION_FACTORY", "")
    with pytest.raises(ValueError, match="No weights are downloaded"):
        perception_provider()


def test_correction_has_a_bounded_retry_count_and_preserves_input(monkeypatch, request_brief):
    from app import repair
    from app.catalog import CATALOG
    from app.marketplace import position_for

    scene = solve_layout(request_brief, "repair")
    item = position_for(scene, CATALOG["sample_sofa"], scene.rooms[0].id)
    item.position = (-2, -2)
    scene.furniture = [item]
    calls = []

    def advice(*args):
        calls.append(args)
        return RepairAdvice(moves=[RepairMove(object_id=item.id, position=(-2, -2))])

    monkeypatch.setattr(repair, "structured", advice)
    with pytest.raises(ValueError, match="three attempts"):
        repair_candidate(scene)
    assert len(calls) == 3
    assert scene.furniture[0].position == (-2, -2)
