import io
import os
from pathlib import Path
from typing import Annotated
from uuid import uuid4

import pymupdf
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError

from .agent_design import instruction_workflow
from .catalog import catalogue_records
from .design_knowledge import attach_profile, profiles
from .geometry import validate_scene
from .inference import InferenceError
from .marketplace_api import marketplace_router
from .models import (
    AgentInstructionRequest,
    AgentProposal,
    CreateProject,
    EditRequest,
    FurnishRequest,
    GenerateRequest,
    Project,
    Reference,
    RevisionRequest,
    Room,
    Scene,
    TraceRequest,
    UpdateBriefRequest,
)
from .operations import apply_operations
from .planner import PlanningError, build_walls, solve_layout
from .settings import model_for
from .store import ConflictError, ProjectStore
from .workflow import design_workflow

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


def create_app(data_dir: Path | None = None) -> FastAPI:
    data_dir = data_dir or ROOT / os.getenv("ARCHAI_DATA_DIR", ".local")
    assets = data_dir / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    store = ProjectStore(data_dir / "projects.sqlite3")
    app = FastAPI(title="ArchAI Studio API", version="0.0.0")
    app.include_router(marketplace_router(store, assets))

    @app.exception_handler(InferenceError)
    async def inference_failure(_request, exc):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(ValueError)
    async def invalid_operation(_request, exc):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(KeyError)
    async def missing_project(_request, _exc):
        return JSONResponse(status_code=404, content={"detail": "Project not found."})

    @app.exception_handler(ConflictError)
    async def project_conflict(_request, exc):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(PlanningError)
    async def planning_failure(_request, exc):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    def current(project_id: str, revision: int) -> Project:
        project = store.get(project_id)
        if project.revision != revision:
            raise ConflictError("Project changed since this view loaded. Reopen it before editing.")
        return project

    def scene_for(project: Project) -> Scene:
        scene = project.candidate_scene or project.committed_scene
        if scene is None:
            raise HTTPException(422, "Generate a plan or calibrate an imported reference first.")
        return scene.model_copy(deep=True)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "model_configured": bool(model_for("requirements"))}

    @app.get("/api/scene-schema")
    def scene_schema():
        return Scene.model_json_schema()

    @app.get("/api/catalogue")
    def catalogue():
        return catalogue_records()

    @app.get("/api/design-styles")
    def design_styles():
        return [profile.model_dump() for profile in profiles()]

    @app.get("/api/projects", response_model=list[Project])
    def projects():
        result = store.list()
        for project in result:
            scene = project.candidate_scene or project.committed_scene
            project.report = validate_scene(scene) if scene else None
        return result

    @app.post("/api/projects", response_model=Project, status_code=201)
    def create_project(request: CreateProject):
        return store.create(request.name)

    @app.get("/api/projects/{project_id}", response_model=Project)
    def get_project(project_id: str):
        project = store.get(project_id)
        scene = project.candidate_scene or project.committed_scene
        project.report = validate_scene(scene) if scene else None
        return project

    @app.post("/api/projects/{project_id}/generate-plan", response_model=Project)
    def generate_plan(project_id: str, request: GenerateRequest):
        project = current(project_id, request.expected_revision)
        scene = solve_layout(request, project_id)
        if request.furnish:
            scene = design_workflow.invoke(
                {
                    "scene": scene,
                    "report": validate_scene(scene),
                    "use_ai": request.use_model,
                    "use_semantic": request.use_semantic,
                }
            )["scene"]
        project.candidate_scene = scene
        project.recommendations = []
        project.agent_proposal = None
        project.report = validate_scene(scene)
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/design-interior", response_model=Project)
    def furnish(project_id: str, request: FurnishRequest):
        project = current(project_id, request.expected_revision)
        scene = scene_for(project)
        report = validate_scene(scene)
        if not report.valid:
            raise HTTPException(422, "Resolve geometry and scale errors before furnishing.")
        result = design_workflow.invoke(
            {
                "scene": scene,
                "report": report,
                "use_ai": request.use_ai,
                "use_semantic": request.use_semantic,
            }
        )
        project.candidate_scene = result["scene"]
        project.report = result["report"]
        project.agent_proposal = None
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/operations", response_model=Project)
    def edit_scene(project_id: str, request: EditRequest):
        project = current(project_id, request.expected_revision)
        scene = scene_for(project)
        scene = apply_operations(scene, [request])
        project.candidate_scene = scene
        project.agent_proposal = None
        project.report = validate_scene(scene)
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/agent-instructions", response_model=Project)
    def agent_instruction(project_id: str, request: AgentInstructionRequest):
        project = current(project_id, request.expected_revision)
        if project.agent_proposal is not None:
            raise HTTPException(
                409, "Approve or reject the current AI proposal before requesting another."
            )
        scene = scene_for(project)
        if request.room_id and not any(room.id == request.room_id for room in scene.rooms):
            raise HTTPException(422, "The selected room does not exist.")
        result = instruction_workflow.invoke({"scene": scene, "request": request})
        project.agent_proposal = AgentProposal(
            instruction=request.instruction,
            explanation=result["explanation"],
            operations=result["operations"],
            base_scene=scene,
            base_was_candidate=project.candidate_scene is not None,
            before_total_mad=validate_scene(scene).total_mad,
            after_total_mad=result["report"].total_mad,
        )
        project.candidate_scene, project.report = result["candidate"], result["report"]
        project.recommendations = []
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/agent-proposal/reject", response_model=Project)
    def reject_agent_proposal(project_id: str, request: RevisionRequest):
        project = current(project_id, request.expected_revision)
        proposal = project.agent_proposal
        if proposal is None:
            raise HTTPException(422, "There is no pending AI proposal.")
        project.candidate_scene = proposal.base_scene if proposal.base_was_candidate else None
        project.agent_proposal = None
        scene = project.candidate_scene or project.committed_scene
        project.report = validate_scene(scene) if scene else None
        project.recommendations = []
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/validate")
    def validate(project_id: str, request: RevisionRequest | None = None):
        project = (
            current(project_id, request.expected_revision) if request else store.get(project_id)
        )
        return validate_scene(scene_for(project))

    @app.post("/api/projects/{project_id}/brief", response_model=Project)
    def update_brief(project_id: str, request: UpdateBriefRequest):
        project = current(project_id, request.expected_revision)
        scene = scene_for(project)
        scene.budget_mad, scene.style = request.budget_mad, request.style
        attach_profile(scene)
        if request.design_assumptions is not None:
            scene.design_assumptions = request.design_assumptions
        project.agent_proposal = None
        project.candidate_scene, project.report = scene, validate_scene(scene)
        project.recommendations = []
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/undo", response_model=Project)
    def undo(project_id: str, request: RevisionRequest):
        project = current(project_id, request.expected_revision)
        if not project.undo_stack:
            raise HTTPException(422, "No draft changes to undo.")
        project.redo_stack = [*project.redo_stack, project.candidate_scene][-20:]
        project.candidate_scene = project.undo_stack.pop()
        project.agent_proposal = None
        scene = project.candidate_scene or project.committed_scene
        project.report = validate_scene(scene) if scene else None
        project.recommendations = []
        return store.save(project, request.expected_revision, track_history=False)

    @app.post("/api/projects/{project_id}/redo", response_model=Project)
    def redo(project_id: str, request: RevisionRequest):
        project = current(project_id, request.expected_revision)
        if not project.redo_stack:
            raise HTTPException(422, "No draft changes to redo.")
        project.undo_stack = [*project.undo_stack, project.candidate_scene][-20:]
        project.candidate_scene = project.redo_stack.pop()
        project.agent_proposal = None
        scene = project.candidate_scene or project.committed_scene
        project.report = validate_scene(scene) if scene else None
        project.recommendations = []
        return store.save(project, request.expected_revision, track_history=False)

    @app.get("/api/projects/{project_id}/snapshots")
    def snapshots(project_id: str):
        return store.snapshots(project_id)

    @app.post("/api/projects/{project_id}/snapshots/{revision}/restore", response_model=Project)
    def restore_snapshot(project_id: str, revision: int, request: RevisionRequest):
        project = current(project_id, request.expected_revision)
        snapshot = next(
            (item for item in store.snapshots(project_id) if item["revision"] == revision), None
        )
        if snapshot is None:
            raise HTTPException(404, "Saved scene not found.")
        project.candidate_scene = Scene.model_validate(snapshot["scene"])
        project.agent_proposal = None
        project.report = validate_scene(project.candidate_scene)
        project.recommendations = []
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/approve", response_model=Project)
    def approve(project_id: str, request: RevisionRequest):
        project = current(project_id, request.expected_revision)
        if project.candidate_scene is None:
            raise HTTPException(422, "There is no draft to approve.")
        report = validate_scene(project.candidate_scene)
        if not report.valid:
            raise HTTPException(
                422, "This draft has validation errors. Resolve them before approval."
            )
        project.committed_scene = project.candidate_scene
        project.agent_proposal = None
        project.candidate_scene = None
        project.agent_proposal = None
        project.report = report
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/discard", response_model=Project)
    def discard(project_id: str, request: RevisionRequest):
        project = current(project_id, request.expected_revision)
        project.candidate_scene = None
        project.recommendations = []
        project.report = (
            validate_scene(project.committed_scene) if project.committed_scene else None
        )
        return store.save(project, request.expected_revision)

    @app.post("/api/projects/{project_id}/upload-plan", response_model=Project)
    async def upload_plan(
        project_id: str,
        file: Annotated[UploadFile, File()],
        expected_revision: Annotated[int, Form()],
        page: Annotated[int, Form()] = 0,
    ):
        project = current(project_id, expected_revision)
        if project.committed_scene or project.candidate_scene:
            raise HTTPException(409, "Import into a new project to preserve the existing scene.")
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        await file.close()
        if not content or len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Upload a nonempty file no larger than 10 MB.")
        try:
            if content.startswith(b"%PDF-"):
                with pymupdf.open(stream=content, filetype="pdf") as document:
                    if document.needs_pass or len(document) > 20 or not 0 <= page < len(document):
                        raise ValueError(
                            "PDF must be unlocked, with at most 20 pages and a valid page."
                        )
                    selected = document[page]
                    # Bound rendered pixels even for PDFs with unusually large page dimensions.
                    scale = min(2, 2400 / max(selected.rect.width, selected.rect.height))
                    pixmap = selected.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
                    image = Image.open(io.BytesIO(pixmap.tobytes("png")))
            else:
                image = Image.open(io.BytesIO(content))
                if image.format not in ("PNG", "JPEG"):
                    raise ValueError("Only PDF, PNG, and JPEG plans are supported.")
                image.load()
            image.thumbnail((2400, 2400))
            image = image.convert("RGB")
        except (
            ValueError,
            UnidentifiedImageError,
            OSError,
            RuntimeError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ) as exc:
            raise HTTPException(
                422, "The file could not be read as a supported plan. Check its contents and page."
            ) from exc
        filename = f"{uuid4()}.png"
        output = assets / filename
        image.save(output)
        previous = project.reference
        project.reference = Reference(
            url=f"/api/assets/{filename}",
            width_px=image.width,
            height_px=image.height,
            filename=Path(file.filename or "Imported plan").name[:100],
            page=page,
        )
        try:
            result = store.save(project, expected_revision)
        except ConflictError:
            output.unlink(missing_ok=True)
            raise
        if previous:
            (assets / Path(previous.url).name).unlink(missing_ok=True)
        return result

    @app.post("/api/projects/{project_id}/calibrate", response_model=Project)
    def calibrate(project_id: str, request: TraceRequest):
        project = current(project_id, request.expected_revision)
        if not project.reference:
            raise HTTPException(422, "Import a reference plan first.")
        if not request.scale_confirmed:
            raise HTTPException(
                422, "Confirm that the entered dimensions describe the full reference footprint."
            )
        width, depth = request.width_m, request.depth_m
        room = Room(
            id="reference_envelope",
            name="Review outline",
            type="living",
            polygon=[(0, 0), (width, 0), (width, depth), (0, depth)],
            provenance="user_corrected",
        )
        scene = Scene(
            id=project_id,
            width_m=width,
            depth_m=depth,
            rooms=[room],
            walls=build_walls([room], width, depth),
            scale_confirmed=True,
            notes=[
                "User-calibrated rectangular reference outline, not detected room geometry.",
                "Computer-vision reconstruction is not implemented; internal walls and openings are not extracted.",
                "Reference is stretched to the entered full footprint; crop margins before importing.",
            ],
        )
        project.candidate_scene = scene
        project.report = validate_scene(scene)
        return store.save(project, request.expected_revision)

    @app.get("/api/assets/{filename}")
    def asset(filename: str):
        try:
            from uuid import UUID

            if str(UUID(filename.removesuffix(".png"))) + ".png" != filename:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(404, "Reference not found.") from exc
        path = assets / filename
        if not path.is_file():
            raise HTTPException(404, "Reference not found.")
        return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})

    @app.delete("/api/projects/{project_id}", status_code=204)
    def delete_project(project_id: str):
        project = store.get(project_id)
        with store.connect() as connection:
            connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            connection.execute("DELETE FROM approved_scenes WHERE project_id = ?", (project_id,))
        if project.reference:
            (assets / Path(project.reference.url).name).unlink(missing_ok=True)

    return app


app = create_app()
