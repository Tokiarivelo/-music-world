"""ShapeRecipe contract (`music-world.shape.v1`): a 3D shape in a closed language, built by deterministic code.

A model never produces vertices (PROJECT.md §6). It produces a recipe: a few parts from a closed list of operations
with bounded numbers. The web builder (`xr/shapes/recipe-builder.ts`) turns it into one geometry that is rendered with
one InstancedMesh per kind. `ShapeRecipe.triangle_count` is the Python mirror of that builder's size: the budget is
checked before anything is built, and a parity test compares it with the real geometry.

Coordinates are normalized: the footprint is the unit square on x/z (centred on 0), the base is at y = 0 and the
instance scales the shape by (footprint, height, footprint) like the builtin kinds. Every field is optional; a field an
operation does not use is ignored.
"""

from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from music_world.schemas.base import ContractModel

SCHEMA_ID = "music-world.shape.v1"

RecipeName = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{1,40}$")]
Op = Literal["box", "prism", "spike", "stack", "cluster"]
Primitive = Literal["box", "prism", "spike"]

MAX_TRIANGLES_CAP = 600  # = SHAPE_TRIANGLE_BUDGET of the web renderer (xr/constants.ts)
DEFAULT_MAX_TRIANGLES = 300
SPIKE_SIDES = 4  # a spike is an open 4-sided cone


def primitive_triangles(of: Primitive, sides: int, taper: float) -> int:
    """Triangles of one primitive. box: 12; prism: n sides as 2n triangles + a bottom cap + a top cap (none when the
    prism ends in a point, taper = 0); spike: 4 (open cone)."""
    if of == "box":
        return 12
    if of == "spike":
        return SPIKE_SIDES
    return 4 * sides if taper > 0 else 2 * sides


class Part(ContractModel):
    op: Op
    of: Primitive = Field(default="box", description="stack and cluster: the primitive that is repeated.")
    width: float = Field(default=0.5, ge=0.05, le=1, description="Footprint along x (diameter for prism and spike).")
    depth: float = Field(default=0.5, ge=0.05, le=1, description="Footprint along z (box only).")
    height: float = Field(default=0.5, ge=0.05, le=1)
    y: float = Field(default=0, ge=0, le=1, description="Height of the part's base above the shape's base.")
    sides: int = Field(default=6, ge=3, le=12, description="prism, and a repeated prism: number of sides.")
    taper: float = Field(default=1, ge=0, le=1, description="prism: top radius / bottom radius; 0 ends in a point.")
    levels: int = Field(default=3, ge=2, le=8, description="stack: number of floors.")
    shrink: float = Field(default=0.8, ge=0.5, le=1, description="stack: width of a floor / width of the one below.")
    count: int = Field(default=4, ge=2, le=12, description="cluster: number of copies.")
    spread: float = Field(default=0.6, ge=0, le=1, description="cluster: radius of the ring of copies (unit square).")
    seed_offset: int = Field(default=0, ge=0, le=99, description="cluster: varies the heights and angles.")

    def triangle_count(self) -> int:
        if self.op in ("box", "prism", "spike"):
            return primitive_triangles(self.op, self.sides, self.taper)
        # stack floors are straight (taper 1); cluster copies keep the part's taper.
        per = primitive_triangles(self.of, self.sides, 1.0 if self.op == "stack" else self.taper)
        return (self.levels if self.op == "stack" else self.count) * per


class ShapeBudget(ContractModel):
    max_triangles: int = Field(
        default=DEFAULT_MAX_TRIANGLES,
        ge=12,
        le=MAX_TRIANGLES_CAP,
        description="Upper bound of the built geometry; the recipe is rejected when its parts need more.",
    )


class ShapeRecipe(ContractModel):
    """Parts of a shape from a closed list of operations, with its own triangle budget."""

    schema_: Literal["music-world.shape.v1"] = Field(default="music-world.shape.v1", alias="schema")
    name: RecipeName = Field(description="Referenced by templates as the kind `recipe:<name>`.")
    parts: list[Part] = Field(min_length=1, max_length=8)
    budget: ShapeBudget = ShapeBudget()

    def triangle_count(self) -> int:
        return sum(p.triangle_count() for p in self.parts)

    @model_validator(mode="after")
    def _within_budget(self) -> "ShapeRecipe":
        triangles = self.triangle_count()
        if triangles > self.budget.max_triangles:
            raise ValueError(f"recipe needs {triangles} triangles, budget is {self.budget.max_triangles}")
        return self
