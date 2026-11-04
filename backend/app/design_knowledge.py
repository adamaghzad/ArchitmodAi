"""Small, validated, project-authored style knowledge; preferences never own geometry."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, get_args

from pydantic import Field, model_validator

from .models import FurnitureNeed, InteriorBrief, Model, RoomType


class PaletteColor(Model):
    name: str
    hex: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    usage: Literal["base", "wood", "fabric", "accent"]


class LightingProfile(Model):
    temperature_kelvin: int = Field(ge=2000, le=6500)
    lamp_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    daylight: str
    ambient: str
    task: str
    accent: str


class TemplateItem(Model):
    role: str
    name: str
    quantity: int = Field(ge=1, le=20)
    priority: Literal["essential", "desired", "optional"]


class StyleProfile(Model):
    id: str
    name: str
    revision: int = Field(ge=1)
    aliases: list[str]
    palette: list[PaletteColor] = Field(min_length=4)
    preferred_furniture_categories: list[str] = Field(min_length=1)
    preferred_materials: list[str] = Field(min_length=1)
    lighting: LightingProfile
    design_characteristics: list[str] = Field(min_length=1)
    room_templates: dict[RoomType, list[TemplateItem]]
    catalogue_affinities: dict[str, float]
    surface_preferences: dict[Literal["floor", "walls"], list[str]]
    surface_preferences_by_room: dict[RoomType, dict[Literal["floor", "walls"], list[str]]] = Field(
        default_factory=dict
    )
    sources: list[str]
    scope_note: str

    @model_validator(mode="after")
    def complete_profile(self):
        if set(self.room_templates) != set(get_args(RoomType)):
            raise ValueError("Every profile needs all five room types")
        if {color.usage for color in self.palette} != {"base", "wood", "fabric", "accent"}:
            raise ValueError("Palette needs base, wood, fabric and accent colours")
        if any(not 0 <= score <= 1 for score in self.catalogue_affinities.values()):
            raise ValueError("Catalogue affinities must be preferences in [0,1]")
        for items in self.room_templates.values():
            if len({item.role for item in items}) != len(items):
                raise ValueError("Template roles must be unique")
        return self

    def color(self, usage):
        return next(color.hex for color in self.palette if color.usage == usage)

    def context(self, room_type):
        return self.model_dump(
            include={
                "id",
                "name",
                "palette",
                "preferred_materials",
                "lighting",
                "design_characteristics",
                "preferred_furniture_categories",
            }
        ) | {
            "room_type": room_type,
            "room_template": [item.model_dump() for item in self.room_templates[room_type]],
        }


@lru_cache(maxsize=1)
def profiles() -> tuple[StyleProfile, ...]:
    path = Path(__file__).resolve().parents[2] / "data/interior_styles.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw["schema_version"] != 1:
        raise ValueError("Unsupported style knowledge schema")
    loaded = tuple(StyleProfile.model_validate(profile) for profile in raw["profiles"])
    if len(loaded) != 5 or len({p.id for p in loaded}) != 5:
        raise ValueError("Exactly five uniquely identified profiles are required")
    # An ID equal to its display name (e.g. Japandi) is intentionally one key.
    claimed = {}
    for p in loaded:
        for name in {p.id.lower(), p.name.lower(), *(alias.lower() for alias in p.aliases)}:
            if name in claimed and claimed[name] != p.id:
                raise ValueError("Style aliases must be unambiguous")
            claimed[name] = p.id
    return loaded


def get_profile(style: str) -> StyleProfile | None:
    key = style.strip().lower()
    return next(
        (
            p
            for p in profiles()
            if key in {p.id.lower(), p.name.lower(), *(alias.lower() for alias in p.aliases)}
        ),
        None,
    )


def chosen_style(style, prompt=""):
    # Preserve the older pastel-brief flow; explicit canonical style choices win.
    return (
        "Pastel"
        if style == "Warm minimal" and ("pastel" in prompt.lower() or "blush" in prompt.lower())
        else style
    )


def attach_profile(scene):
    profile = get_profile(scene.style)
    if profile is None:
        return None
    brief = scene.design_brief or InteriorBrief()
    brief.profile_id, brief.profile_revision = profile.id, profile.revision
    brief.template_furniture = [
        FurnitureNeed(**item.model_dump(), room_type=room_type, origin="template")
        for room_type in dict.fromkeys(room.type for room in scene.rooms)
        for item in profile.room_templates[room_type]
    ]
    scene.design_brief = brief
    return profile


def effective_needs(scene):
    if not scene.design_brief:
        return []
    brief = scene.design_brief
    explicit = {(need.room_type, need.role): need for need in brief.furniture}
    merged = dict(explicit)
    for need in brief.template_furniture:
        key = (need.room_type, need.role)
        if key not in merged and f"{need.room_type}:{need.role}" not in brief.excluded_roles:
            merged[key] = need
    return list(merged.values())


def surface_preferences(profile, room_type, surface):
    return profile.surface_preferences_by_room.get(room_type, {}).get(
        surface, profile.surface_preferences[surface]
    )
