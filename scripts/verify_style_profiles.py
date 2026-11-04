"""Review equal-size style outputs; --semantic uses the configured local model."""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.design_knowledge import profiles
from app.geometry import validate_scene
from app.models import GenerateRequest
from app.planner import solve_layout
from app.workflow import design_workflow


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--semantic",
        action="store_true",
        help="Invoke existing local EmbeddingGemma. No models are downloaded.",
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / ".local/style-review/results.json"
    )
    args = parser.parse_args()
    results = []
    for profile in profiles():
        started = time.perf_counter()
        scene = solve_layout(
            GenerateRequest(
                expected_revision=0,
                width_m=5,
                depth_m=4,
                budget_mad=30000,
                style=profile.name,
                rooms=[{"type": "bedroom", "min_area_m2": 20}],
            ),
            "style-review-" + profile.id,
        )
        result = design_workflow.invoke(
            {
                "scene": scene,
                "report": validate_scene(scene),
                "use_semantic": args.semantic,
            }
        )
        scene, report = result["scene"], result["report"]
        results.append(
            {
                "profile_id": profile.id,
                "seconds": round(time.perf_counter() - started, 3),
                "geometry_valid": report.valid,
                "budget_mad": scene.budget_mad,
                "total_mad": report.total_mad,
                "products": [item.product_id for item in scene.furniture],
                "finishes": [item.product_id for item in scene.materials],
                "furniture_colours": sorted(
                    {
                        (item.fabric_color, item.wood_color, item.light_color)
                        for item in scene.furniture
                    }
                ),
                "completeness": report.completeness.model_dump(),
                "ranking": result["rankings"],
            }
        )
        print(
            f"{profile.name}: {len(scene.furniture)} objects, {report.total_mad:g} MAD, geometry={report.valid}",
            flush=True,
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {"semantic_requested": args.semantic, "room_m": [5, 4], "results": results},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    if not all(
        result["geometry_valid"] and result["total_mad"] <= result["budget_mad"]
        for result in results
    ):
        raise SystemExit("Style review failed geometry/budget validation")
    if args.semantic and not all(
        data["semantic"]["status"] == "used"
        for result in results
        for data in result["ranking"].values()
    ):
        raise SystemExit(
            "Local embeddings were not used for every style; inspect recorded fallback reasons"
        )


if __name__ == "__main__":
    main()
