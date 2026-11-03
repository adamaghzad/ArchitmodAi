import pytest
from pydantic import ValidationError
from shapely.geometry import Polygon

from app.geometry import validate_scene
from app.models import Furniture, Opening, Room, Scene, Wall
from app.planner import PlanningError, solve_layout
from app.workflow import design_workflow


def test_solver_produces_nonoverlapping_rooms_with_required_area(request_brief):
    scene = solve_layout(request_brief, "test")
    report = validate_scene(scene)
    assert report.valid, report.issues
    assert len(scene.rooms) == len(request_brief.rooms)
    for room, requirement in zip(scene.rooms, request_brief.rooms, strict=True):
        assert Polygon(room.polygon).area >= requirement.min_area_m2 - 0.001
    assert all(opening.wall_id in {wall.id for wall in scene.walls} for opening in scene.openings)


def test_solver_reports_infeasible_areas(request_brief):
    request_brief.width_m, request_brief.depth_m = 3, 3
    with pytest.raises(PlanningError, match="minimum room areas exceed"):
        solve_layout(request_brief, "test")


def test_placement_is_idempotent_and_stays_within_budget(request_brief):
    scene = solve_layout(request_brief, "test")
    result = design_workflow.invoke({"scene": scene, "report": validate_scene(scene)})
    repeated = design_workflow.invoke(result)
    assert result["scene"].furniture
    assert result["report"].valid
    assert result["report"].total_mad <= scene.budget_mad
    assert len(repeated["scene"].furniture) == len(result["scene"].furniture)
    assert scene.furniture == []  # Candidate generation never mutates the input snapshot.


def test_unknown_product_and_outside_furniture_are_reported(request_brief):
    scene = solve_layout(request_brief, "test")
    scene.furniture = [
        Furniture(id="unknown", product_id="invented", room_id=scene.rooms[0].id, position=(0, 0)),
        Furniture(
            id="outside", product_id="sample_sofa", room_id=scene.rooms[0].id, position=(-2, -2)
        ),
    ]
    report = validate_scene(scene)
    assert not report.valid
    assert {"unknown_product", "furniture_outside"} <= {issue.code for issue in report.issues}


def test_overlaps_opening_bounds_scale_and_budget_are_hard_failures(request_brief):
    scene = solve_layout(request_brief, "test")
    room = scene.rooms[0]
    scene.scale_confirmed = False
    scene.budget_mad = 1
    scene.furniture = [
        Furniture(id="a", product_id="sample_sofa", room_id=room.id, position=(0.3, 0.3)),
        Furniture(id="b", product_id="sample_sofa", room_id=room.id, position=(0.3, 0.3)),
    ]
    scene.openings.append(
        Opening(id="bad", type="door", wall_id=scene.walls[0].id, offset_m=99, width_m=2)
    )
    report = validate_scene(scene)
    assert not report.valid
    assert {"scale_unconfirmed", "over_budget", "furniture_overlap", "opening_outside"} <= {
        issue.code for issue in report.issues
    }


def test_wall_correction_cannot_silently_break_room_boundary(request_brief):
    scene = solve_layout(request_brief, "test")
    scene.walls[0].start = (-1, -1)
    report = validate_scene(scene)
    assert not report.valid
    assert {"wall_outside", "unclosed_room"} <= {issue.code for issue in report.issues}


def test_schema_rejects_nonfinite_values_unknown_fields_and_zero_walls():
    with pytest.raises(ValidationError):
        Scene(id="test", width_m=float("nan"), depth_m=4)
    with pytest.raises(ValidationError):
        Wall(id="bad", start=(0, 0), end=(0, 0))
    with pytest.raises(ValidationError):
        Scene(id="test", width_m=5, depth_m=4, execute_code="anything")


def test_invalid_polygon_is_reported_without_crashing():
    scene = Scene(
        id="test",
        width_m=5,
        depth_m=5,
        rooms=[
            Room(
                id="crossed",
                name="Crossed",
                type="living",
                polygon=[(0, 0), (4, 4), (0, 4), (4, 0)],
            )
        ],
    )
    report = validate_scene(scene)
    assert not report.valid
    assert "invalid_room" in {issue.code for issue in report.issues}
