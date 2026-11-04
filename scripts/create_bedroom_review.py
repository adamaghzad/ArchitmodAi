"""Reproduce the bedroom in isolated review/test storage, without modifying dev data."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.geometry import validate_scene
from app.models import GenerateRequest, Scene
from app.planner import solve_layout
from app.store import ProjectStore
from app.workflow import design_workflow

PROMPT = (
    "A cute pastel bedroom with a double bed with upholstered headboard, two bedside tables, "
    "vanity desk and mirror, wardrobe, reading armchair, small bookshelf, rug, two lamps "
    "and two decorative plants. Blush pink, warm cream, sage green, light oak, soft fabrics "
    "and warm natural lighting."
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--before", action="store_true")
    mode.add_argument("--live", action="store_true")
    mode.add_argument(
        "--recorded-live",
        action="store_true",
        help="Render the recorded live model scene without invoking inference",
    )
    parser.add_argument("--budget", type=float, default=20000)
    args = parser.parse_args()
    target = args.data_dir.resolve()
    if target not in [
        (ROOT / ".local/e2e").resolve(),
        (ROOT / ".local/render-review").resolve(),
    ]:
        parser.error("Use .local/e2e or .local/render-review to isolate review data")
    if args.recorded_live:
        recorded = json.loads(
            (ROOT / "docs/bedroom/live-verification.json").read_text(encoding="utf-8")
        )
        scene = Scene.model_validate(recorded["scene"])
    elif args.before:
        scene = Scene.model_validate_json(
            (ROOT / "data/scenes/bedroom-before.json").read_text(encoding="utf-8")
        )
    else:
        if args.live:
            from dotenv import load_dotenv

            load_dotenv(ROOT / "backend/.env")
        request = GenerateRequest(
            expected_revision=0,
            width_m=5,
            depth_m=4,
            budget_mad=args.budget,
            prompt=PROMPT,
            use_model=args.live,
            rooms=[{"type": "bedroom", "min_area_m2": 20}],
        )
        scene = solve_layout(request, "pastel-bedroom")
        scene = design_workflow.invoke(
            {"scene": scene, "report": validate_scene(scene), "use_ai": args.live}
        )["scene"]
    report = validate_scene(scene)
    if not report.valid:
        raise ValueError(report.model_dump_json())
    store = ProjectStore(target / "projects.sqlite3")
    project = store.create("Pastel bedroom · " + ("before" if args.before else "after"))
    project.candidate_scene, project.report = scene, report
    project = store.save(project, project.revision)
    print(
        json.dumps(
            {
                "id": project.id,
                "scene": scene.model_dump(),
                "report": report.model_dump(),
            }
        )
    )


if __name__ == "__main__":
    main()
