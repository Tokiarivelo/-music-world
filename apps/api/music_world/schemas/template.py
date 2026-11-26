"""World template contract (`music-world.template.v1`): the data that tells the world engine how to build a world.

Templates are data only (tech.md rule 6): closed enums, bounded numbers, `#rrggbb` colors, no URLs, no code.
They come from the default template, the store, or the AI World Director (validated here before use).
"""

from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from music_world.schemas.base import ContractModel
from music_world.schemas.shape import ShapeRecipe

SCHEMA_ID = "music-world.template.v1"
MAX_RECIPES = 28  # the AI World Director is held to 4 (director/domain/renderable.py)
MAX_SCENERY_ITEMS = 40
MAX_SCENERY_TOTAL = 400

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]

BuiltinShapeKind = Literal[
    "terrain_ridge",
    "building",
    "spike",
    "crystal",
    "cluster",
    "cloud",
    "tree",
    "conifer",
    "bush",
    "car",
    "bicycle",
    "airplane",
]
RecipeShapeKind = Annotated[str, StringConstraints(pattern=r"^recipe:[a-z0-9_]{1,40}$")]
ShapeKind = BuiltinShapeKind | RecipeShapeKind

ColorRole = Literal["primary", "accent", "secondary", "staff", "line"]
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
    style: Literal["glowing_lines", "aurora", "current"] = Field(
        default="glowing_lines",
        description="aurora: notes rain from the sky; current: notes are carried to the plate by ocean currents.",
    )
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
    line: str | None = Field(
        default=None, pattern=r"^[a-z0-9-]{1,32}$", description="Voice line id (user edits); `main` is the original."
    )
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


class SceneryItem(ContractModel):
    """`count` objects of `kind` that stand on the plate from the first frame (no note needed).

    Their positions come from the world seed inside the zones of their kind (the whole plate when it has none), so a
    new seed rearranges them. They share the instance budget of their kind with the notes."""

    kind: ShapeKind
    count: int = Field(ge=1, le=60)


LayoutTheme = Literal["kelp", "coral", "sand", "wreck", "keep", "village", "forest", "crystal"]
ObjectRole = Literal[
    "building", "flora", "vehicle", "sky", "landmark", "terrain", "benthic", "swimmer", "giant", "effect", "other"
]
MAX_LAYOUT_PATCHES = 24
MAX_LAYOUT_STEPS = 48


class InventoryEntry(ContractModel):
    """One kind of object the template can put in the world, with its role (what it is for)."""

    kind: ShapeKind
    role: ObjectRole


class LayoutPatch(ContractModel):
    """A region of the plate (normalized -1..1) where objects of one theme grow, from the centre of the world out."""

    id: str = Field(pattern=r"^[a-z0-9_]{1,24}$")
    theme: LayoutTheme
    x: float = Field(ge=-1, le=1)
    z: float = Field(ge=-1, le=1)
    radius: float = Field(ge=0.05, le=0.6, description="Fraction of the half plate.")


class LayoutStep(ContractModel):
    """One object of the inventory, the patch it grows in and how often the notes pick it."""

    kind: ShapeKind
    patch: str = Field(pattern=r"^[a-z0-9_]{1,24}$", description="Id of a layout patch.")
    weight: float = Field(default=1.0, ge=0, le=10, description="0 keeps the object out of the note rotation.")


class WorldLayout(ContractModel):
    """How the objects of a template are laid out: written by the director from the template's inventory.

    Notes walk through `sequence` in order (each step in proportion to its weight): the note gets that object and a
    spot inside that patch. A template without a layout gets one derived from its inventory (web engine)."""

    inventory: list[InventoryEntry] = Field(default=[], max_length=MAX_RECIPES + 12)
    patches: list[LayoutPatch] = Field(default=[], max_length=MAX_LAYOUT_PATCHES)
    sequence: list[LayoutStep] = Field(default=[], max_length=MAX_LAYOUT_STEPS)

    @model_validator(mode="after")
    def _steps_use_known_patches(self) -> "WorldLayout":
        ids = [p.id for p in self.patches]
        if len(set(ids)) != len(ids):
            raise ValueError("layout: patch ids must be unique")
        known = set(ids)
        for step in self.sequence:
            if step.patch not in known:
                raise ValueError(f"layout: step {step.kind} uses the unknown patch {step.patch}")
        return self


class Budget(ContractModel):
    instances_per_kind: int = Field(default=2000, ge=1, le=2000, description="Cap; extra notes reuse the oldest slot.")


class Fx(ContractModel):
    particles: Literal["arcs", "dust", "none"] = "arcs"
    bloom: float = Field(default=0.8, ge=0, le=2)
    beat_pulse: bool = True
    chord_links: Literal["light_arc", "none"] = "light_arc"
    material: Literal["flat", "polished"] = Field(
        default="polished",
        description="polished: lit PBR with sky reflections on trees, cars, planes, clouds, crystals and recipes; "
        "flat: unlit colors (the look of the reference image).",
    )
    environment: Literal["land", "underwater"] = Field(
        default="land",
        description="land: sky, hills, weather; underwater: water column with light rays, seabed, dunes, fog and "
        "rising bubbles (no sky, clouds, sun or rain).",
    )


class GeneratedBy(ContractModel):
    """Which AI World Director run produced a template (05-ai-world-director requirement 1.4)."""

    provider: Literal["muse", "bedrock", "mock"]
    model: str = Field(pattern=r"^[A-Za-z0-9._:-]{1,80}$")
    prompt_version: str = Field(pattern=r"^[A-Za-z0-9._-]{1,40}$")


class TemplateMeta(ContractModel):
    generated_by: GeneratedBy | None = Field(default=None, description="Set by the director, never by a model.")


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
    recipes: list[ShapeRecipe] = Field(
        default=[],
        max_length=MAX_RECIPES,
        description="Shapes referenced as `recipe:<name>` by mappings, zones and scenery.",
    )
    scenery: list[SceneryItem] = Field(
        default=[],
        max_length=MAX_SCENERY_ITEMS,
        description="Objects present before the first note (an ocean full of fish, a forest…), placed from the seed.",
    )
    layout: WorldLayout | None = Field(
        default=None, description="Object layout written by the director for this template's inventory."
    )
    meta: TemplateMeta | None = None

    @model_validator(mode="after")
    def _recipe_names_are_unique(self) -> "WorldTemplate":
        names = [r.name for r in self.recipes]
        if len(set(names)) != len(names):
            raise ValueError("recipes: names must be unique")
        return self

    @model_validator(mode="after")
    def _scenery_total_is_bounded(self) -> "WorldTemplate":
        if sum(item.count for item in self.scenery) > MAX_SCENERY_TOTAL:
            raise ValueError(f"scenery: at most {MAX_SCENERY_TOTAL} objects in total")
        return self
