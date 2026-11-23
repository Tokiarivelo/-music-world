"""World template contract (`music-world.template.v1`): the data that tells the world engine how to build a world.

Templates are data only (tech.md rule 6): closed enums, bounded numbers, `#rrggbb` colors, no URLs, no code.
They come from the default template, the store, or the AI World Director (validated here before use).
"""

from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from music_world.schemas.base import ContractModel

SCHEMA_ID = "music-world.template.v1"

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]

BuiltinShapeKind = Literal["terrain_ridge", "building", "spike", "crystal", "cluster"]
RecipeShapeKind = Annotated[str, StringConstraints(pattern=r"^recipe:[a-z0-9_]{1,40}$")]
ShapeKind = BuiltinShapeKind | RecipeShapeKind

ColorRole = Literal["primary", "accent", "secondary", "staff"]
Stem = Literal["vocals", "drums", "bass", "other"]
License = Literal["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "MIT"]

# `<48`, `>72` (strict) or `48-72` (inclusive); integers for pitch, decimals allowed for velocity.
PitchRange = Annotated[str, StringConstraints(pattern=r"^(<\d{1,3}|>\d{1,3}|\d{1,3}-\d{1,3})$")]
_UNIT = r"(0(\.\d{1,4})?|1(\.0{1,4})?)"
VelocityRange = Annotated[str, StringConstraints(pattern=rf"^(<{_UNIT}|>{_UNIT}|{_UNIT}-{_UNIT})$")]


class Palette(ContractModel):
    background: HexColor
    terrain: HexColor
    primary: HexColor
    accent: HexColor
    secondary: HexColor
    staff: HexColor


class Terrain(ContractModel):
    style: Literal["cracked_plate", "smooth_plate"] = "cracked_plate"
    mountains: Literal["edges", "none"] = "edges"
    size: float = Field(default=12.0, ge=4, le=40, description="Side of the square plate, in metres (desktop scale).")


class Staff(ContractModel):
    style: Literal["glowing_lines"] = "glowing_lines"
    path: Literal["diagonal_curve", "straight"] = "diagonal_curve"
    clef: Literal["treble", "none"] = "treble"
    glow: float = Field(default=1.2, ge=0, le=3)
    lookahead: float = Field(default=4.0, ge=1, le=8, description="Seconds a note shows on the staff before onset.")
    fall_duration: float = Field(default=0.35, ge=0.1, le=2, description="Seconds from leaving the staff to landing.")


class MappingCondition(ContractModel):
    """All present fields must match (AND); an empty condition matches every note."""

    pitch: PitchRange | None = None
    chord: bool | None = Field(default=None, description="True: only chord notes; false: only notes outside chords.")
    stem: Stem | None = None
    velocity: VelocityRange | None = None


class MappingRule(ContractModel):
    when: MappingCondition
    spawn: ShapeKind
    height_from: Literal["velocity", "duration", "pitch"] = "velocity"
    color_role: ColorRole | None = Field(default=None, description="Default: gradient by pitch inside the zone.")


class Zone(ContractModel):
    """Rectangle on the plate in normalized coordinates (-1 = left/far edge, 1 = right/near edge)."""

    kind: ShapeKind
    x_min: float = Field(ge=-1, le=1)
    x_max: float = Field(ge=-1, le=1)
    z_min: float = Field(ge=-1, le=1)
    z_max: float = Field(ge=-1, le=1)

    @model_validator(mode="after")
    def _ordered(self) -> "Zone":
        if self.x_min >= self.x_max or self.z_min >= self.z_max:
            raise ValueError("zone bounds must satisfy x_min < x_max and z_min < z_max")
        return self


class Budget(ContractModel):
    instances_per_kind: int = Field(default=2000, ge=1, le=2000, description="Cap; extra notes reuse the oldest slot.")


class Fx(ContractModel):
    particles: Literal["arcs", "dust", "none"] = "arcs"
    bloom: float = Field(default=0.8, ge=0, le=2)
    beat_pulse: bool = True
    chord_links: Literal["light_arc", "none"] = "light_arc"


class WorldTemplate(ContractModel):
    """Palette, terrain, staff, note-to-shape mappings, layout zones and effects of a world."""

    model_config = ConfigDict(title="WorldTemplate")

    schema_: Literal["music-world.template.v1"] = Field(alias="schema")
    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=60)
    name: str = Field(min_length=1, max_length=60)
    license: License
    palette: Palette
    terrain: Terrain = Terrain()
    staff: Staff = Staff()
    mappings: list[MappingRule] = Field(min_length=1, max_length=32, description="In order; first match wins.")
    zones: list[Zone] = Field(default=[], max_length=16, description="Kinds without a zone use the whole plate.")
    budget: Budget = Budget()
    fx: Fx = Fx()
