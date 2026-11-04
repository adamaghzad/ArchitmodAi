from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


Coordinate = Annotated[float, Field(ge=-100, le=100)]
Point = tuple[Coordinate, Coordinate]
Positive = Annotated[float, Field(gt=0, le=100)]
RoomType = Literal["living", "bedroom", "kitchen", "bathroom", "office"]


class RoomRequirement(Model):
    type: RoomType
    min_area_m2: float = Field(ge=3, le=400)


class Brief(Model):
    rooms: list[RoomRequirement] = Field(min_length=1, max_length=8)


class GenerateRequest(Model):
    expected_revision: int = Field(ge=0)
    width_m: float = Field(ge=3, le=25)
    depth_m: float = Field(ge=3, le=25)
    budget_mad: float = Field(default=20000, ge=0, le=10000000)
    style: Literal["Warm minimal", "Scandinavian", "Contemporary"] = "Warm minimal"
    prompt: str = Field(default="", max_length=2000)
    use_model: bool = False
    rooms: list[RoomRequirement] = Field(min_length=1, max_length=8)


class Room(Model):
    id: str
    type: RoomType
    name: str
    polygon: list[Point] = Field(min_length=3, max_length=64)
    color: str = "#b5ad97"
    provenance: Literal["ai_generated", "user_corrected"] = "ai_generated"


class Wall(Model):
    id: str
    start: Point
    end: Point
    thickness: float = Field(default=0.15, gt=0, le=1)
    height: float = Field(default=2.8, gt=0, le=10)

    @model_validator(mode="after")
    def nonzero_length(self):
        if self.start == self.end:
            raise ValueError("Wall endpoints must be different")
        return self


class Opening(Model):
    id: str
    type: Literal["door", "window"]
    wall_id: str
    offset_m: float = Field(ge=0, le=100)
    width_m: Positive
    height_m: Positive = 2.1
    sill_m: float = Field(default=0, ge=0, le=10)


class Furniture(Model):
    id: str
    product_id: str
    room_id: str
    position: Point
    rotation_deg: Literal[0, 90, 180, 270] = 0


class MaterialSelection(Model):
    id: str
    product_id: str
    room_id: str
    surface: Literal["floor", "walls"]
    area_m2: float = Field(ge=0)
    waste_fraction: float = Field(default=0.1, ge=0, le=0.5)
    units: int = Field(ge=1)


class Recommendation(Model):
    id: str
    product_id: str
    room_id: str
    reason: str
    surface: Literal["floor", "walls"] | None = None
    status: Literal["pending", "accepted", "rejected"] = "pending"
    mock_data: bool = True


class DesignAssumptions(Model):
    """Configurable design checks, not statutory accessibility requirements."""

    min_door_width_m: float = Field(default=0.75, ge=0.5, le=1.5)
    min_door_height_m: float = Field(default=2, ge=1.8, le=3)
    circulation_width_m: float = Field(default=0.6, ge=0.3, le=1.5)
    door_approach_m: float = Field(default=0.6, ge=0.3, le=1.5)


class Scene(Model):
    id: str
    units: Literal["m"] = "m"
    width_m: Positive
    depth_m: Positive
    scale_confirmed: bool = True
    style: str = "Warm minimal"
    budget_mad: float = Field(default=20000, ge=0)
    rooms: list[Room] = Field(default_factory=list, max_length=100)
    walls: list[Wall] = Field(default_factory=list, max_length=1000)
    openings: list[Opening] = Field(default_factory=list, max_length=1000)
    furniture: list[Furniture] = Field(default_factory=list, max_length=1000)
    materials: list[MaterialSelection] = Field(default_factory=list, max_length=1000)
    notes: list[str] = Field(default_factory=list)
    design_assumptions: DesignAssumptions = Field(default_factory=DesignAssumptions)


class Issue(Model):
    code: str
    message: str
    severity: Literal["error", "warning"] = "error"
    object_id: str | None = None
    related_object_ids: list[str] = Field(default_factory=list)


class ValidationReport(Model):
    valid: bool
    issues: list[Issue]
    total_mad: float
    sample_prices: bool = True
    furniture_total_mad: float = 0
    materials_total_mad: float = 0


class AgentOperation(Model):
    type: Literal[
        "move_furniture",
        "update_wall",
        "update_opening",
        "set_material",
        "delete_furniture",
        "place_furniture",
        "remove_furniture",
        "replace_furniture",
        "change_material",
        "update_room",
    ]
    object_id: str
    position: Point | None = None
    rotation_deg: Literal[0, 90, 180, 270] | None = None
    start: Point | None = None
    end: Point | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    height: float | None = Field(default=None, gt=0, le=10)
    thickness: float | None = Field(default=None, gt=0, le=1)
    offset_m: float | None = Field(default=None, ge=0, le=100)
    width_m: Positive | None = None
    height_m: Positive | None = None
    sill_m: float | None = Field(default=None, ge=0, le=10)
    product_id: str | None = None
    room_id: str | None = None
    surface: Literal["floor", "walls"] | None = None
    polygon: list[Point] | None = Field(default=None, min_length=3, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    room_type: RoomType | None = None

    @model_validator(mode="after")
    def required_fields(self):
        fields = {
            "move_furniture": ("position",),
            "place_furniture": ("product_id", "room_id"),
            "replace_furniture": ("product_id",),
            "change_material": ("product_id", "room_id", "surface"),
            "set_material": ("color",),
        }.get(self.type, ())
        if any(getattr(self, field) is None for field in fields):
            raise ValueError(f"Missing fields for {self.type}: {', '.join(fields)}")
        return self


class AgentProposal(Model):
    instruction: str
    explanation: str
    operations: list[AgentOperation]
    base_scene: Scene
    before_total_mad: float
    after_total_mad: float
    base_was_candidate: bool = False


class Reference(Model):
    url: str
    width_px: int
    height_px: int
    filename: str
    page: int


class Project(Model):
    id: str
    name: str
    revision: int = 0
    created_at: str
    updated_at: str
    committed_scene: Scene | None = None
    candidate_scene: Scene | None = None
    reference: Reference | None = None
    report: ValidationReport | None = None
    recommendations: list[Recommendation] = Field(default_factory=list)
    perception: dict | None = None
    agent_proposal: AgentProposal | None = None
    undo_stack: list[Scene | None] = Field(default_factory=list, max_length=20)
    redo_stack: list[Scene | None] = Field(default_factory=list, max_length=20)


class CreateProject(Model):
    name: str = Field(min_length=1, max_length=100)


class RevisionRequest(Model):
    expected_revision: int = Field(ge=0)


class TraceRequest(RevisionRequest):
    width_m: float = Field(ge=3, le=25)
    depth_m: float = Field(ge=3, le=25)
    scale_confirmed: bool


class EditRequest(AgentOperation, RevisionRequest):
    pass


class FurnishRequest(RevisionRequest):
    use_ai: bool = False


class UpdateBriefRequest(RevisionRequest):
    budget_mad: float = Field(ge=0, le=10000000)
    style: Literal["Warm minimal", "Scandinavian", "Contemporary"]
    design_assumptions: DesignAssumptions | None = None


class AgentInstructionRequest(RevisionRequest):
    instruction: str = Field(min_length=3, max_length=2000)
    room_id: str | None = None
    object_id: str | None = None


class InstructionIntent(Model):
    room_ids: list[str] = Field(min_length=1, max_length=8)
    action: Literal[
        "replace_room_furniture",
        "replace_furniture",
        "place_furniture",
        "change_material",
        "edit_objects",
    ]
    object_ids: list[str] = Field(default_factory=list, max_length=20)
    style: Literal["Warm minimal", "Scandinavian", "Contemporary"] | None = None
    budget_mad: float | None = Field(default=None, ge=0, le=10000000)
    explanation: str = Field(min_length=1, max_length=1000)


class OperationAdvice(Model):
    operations: list[AgentOperation] = Field(min_length=1, max_length=30)
    explanation: str = Field(min_length=1, max_length=1000)


class AddProductRequest(RevisionRequest):
    product_id: str
    room_id: str
    surface: Literal["floor", "walls"] = "floor"
    waste_fraction: float = Field(default=0.1, ge=0, le=0.5)
    replace_id: str | None = None


class RecommendRequest(RevisionRequest):
    room_id: str | None = None
    use_ai: bool = False


class SuggestionDecision(RevisionRequest):
    accept: bool


class RemoveProductRequest(RevisionRequest):
    object_id: str


class ProductAdvice(Model):
    product_ids: list[str] = Field(max_length=8)
    explanations: list[str] = Field(max_length=8)


class LayoutOrder(Model):
    room_indices: list[int] = Field(min_length=1, max_length=8)


class RepairMove(Model):
    object_id: str
    position: Point
    rotation_deg: Literal[0, 90, 180, 270] = 0


class RepairAdvice(Model):
    moves: list[RepairMove] = Field(min_length=1, max_length=20)
