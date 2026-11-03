import importlib
import os
from typing import Protocol

import cv2
import numpy as np
from pydantic import Field

from .models import Model


class PerceptionResult(Model):
    provider: str
    width_px: int
    height_px: int
    wall_candidates: list[list[list[float]]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SegmentationModel(Protocol):
    """A locally supplied model; factories must never download weights automatically."""

    def predict_wall_mask(self, image_rgb: np.ndarray) -> np.ndarray: ...


class PerceptionProvider(Protocol):
    def analyze(self, image_rgb: np.ndarray) -> PerceptionResult: ...


class OpenCVPipeline:
    def __init__(self, segmentation: SegmentationModel | None = None):
        self.segmentation = segmentation

    def analyze(self, image_rgb: np.ndarray) -> PerceptionResult:
        height, width = image_rgb.shape[:2]
        scale = min(1, 1600 / max(width, height))
        resized = cv2.resize(
            image_rgb, (max(1, round(width * scale)), max(1, round(height * scale)))
        )
        result = PerceptionResult(
            provider="segmentation" if self.segmentation else "opencv",
            width_px=width,
            height_px=height,
            warnings=[
                "Unreviewed line proposals only; symbols, topology, rooms, openings, and metric scale are not inferred."
            ],
        )
        if min(width, height) < 16:
            result.warnings.append("Reference is too small for line analysis.")
            return result
        if self.segmentation:
            mask = np.asarray(self.segmentation.predict_wall_mask(resized))
            if mask.shape != resized.shape[:2] or not np.isfinite(mask).all():
                raise ValueError("Segmentation provider returned an invalid wall mask.")
            edges = (mask > 0.5).astype(np.uint8) * 255
        else:
            gray = cv2.cvtColor(resized, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 60, 160)
        lines = cv2.HoughLinesP(
            edges,
            1,
            np.pi / 180,
            threshold=35,
            minLineLength=max(20, min(resized.shape[:2]) // 10),
            maxLineGap=10,
        )
        if lines is not None:
            for x0, y0, x1, y1 in lines[:, 0][:300]:
                if abs(x1 - x0) <= 5 or abs(y1 - y0) <= 5:
                    result.wall_candidates.append(
                        [
                            [round(float(x0) / scale, 2), round(float(y0) / scale, 2)],
                            [round(float(x1) / scale, 2), round(float(y1) / scale, 2)],
                        ]
                    )
        return result


def perception_provider() -> PerceptionProvider:
    name = os.getenv("CV_PROVIDER", "opencv")
    if name == "opencv":
        return OpenCVPipeline()
    if name == "segmentation":
        factory_path = os.getenv("CV_SEGMENTATION_FACTORY", "")
        if not factory_path:
            raise ValueError(
                "Configure CV_SEGMENTATION_FACTORY for a trained local model. No weights are downloaded."
            )
        module, factory = factory_path.split(":", 1)
        return OpenCVPipeline(getattr(importlib.import_module(module), factory)())
    raise ValueError("Unknown CV_PROVIDER. Select opencv or segmentation.")
