"""Create a review project in an explicitly selected isolated data directory."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.catalog import CATALOG
from app.geometry import validate_scene
from app.materials import material_selection
from app.models import Scene
from app.store import ProjectStore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    allowed = [
        (ROOT / ".local/e2e").resolve(),
        (ROOT / ".local/render-review").resolve(),
    ]
    if data_dir not in allowed:
        parser.error(
            "Use .local/e2e or .local/render-review to keep development data isolated"
        )
    scene = Scene.model_validate_json(
        (ROOT / "data/scenes/japandi-office.json").read_text(encoding="utf-8")
    )
    scene.materials = [
        material_selection(scene, CATALOG["oak_floor"], "office", "floor"),
        material_selection(scene, CATALOG["warm_paint"], "office", "walls"),
    ]
    report = validate_scene(scene)
    if not report.valid:
        raise ValueError(report.model_dump_json())
    store = ProjectStore(data_dir / "projects.sqlite3")
    project = store.create("Japandi home office · rendering review")
    project.candidate_scene = scene
    project.report = report
    project = store.save(project, project.revision)
    print(
        json.dumps(
            {
                "id": project.id,
                "report": report.model_dump(),
                "scene": scene.model_dump(),
            }
        )
    )


if __name__ == "__main__":
    main()
