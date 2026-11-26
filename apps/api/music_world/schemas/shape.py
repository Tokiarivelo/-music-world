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
NodePrimitive = Literal["box", "cylinder", "cone", "sphere", "prism", "gable", "extrude"]
NodeOperation = Literal["add", "union", "subtract"]
NodeId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{1,24}$")]
NodeName = Annotated[str, StringConstraints(min_length=1, max_length=40)]
PartColorRole = Literal["primary", "accent", "secondary", "staff", "line"]
PartHex = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
PartTexture = Literal["none", "brick", "wood", "stone", "tile", "glass"]
MAX_NODES = 48
MAX_PROFILE_POINTS = 12
BEVELLED_BOX_TRIANGLES = 44  # 6 faces x 2 + 12 edge strips x 2 + 8 corners
BOOLEAN_EXTRA_TRIANGLES = 48  # estimate added per union / subtract node: the real count is checked after the build
MAX_NODE_DEPTH = 4
SPHERE_SEGMENTS = 8  # mirrored by SPHERE_SEGMENTS / SPHERE_RINGS in xr/shapes/node-builder.ts
SPHERE_RINGS = 6
GABLE_TRIANGLES = 8  # two end triangles, two sloped rectangles, one bottom rectangle

DEFAULT_FOOTPRINT_M = 0.25  # mirrored by RECIPE_FOOTPRINT (apps/web/src/xr/constants.ts)
MAX_TRIANGLES_CAP = 2000  # PROJECT.md §6 example; builtin kinds stay under SHAPE_TRIANGLE_BUDGET (xr/constants.ts)
DEFAULT_MAX_TRIANGLES = 500
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


class Vec3(ContractModel):
    x: float = Field(default=0, ge=-2, le=2)
    y: float = Field(default=0, ge=-2, le=2)
    z: float = Field(default=0, ge=-2, le=2)


class Point2(ContractModel):
    """A point of an extrusion outline on the ground plane, inside the unit footprint."""

    x: float = Field(default=0, ge=-0.5, le=0.5)
    z: float = Field(default=0, ge=-0.5, le=0.5)


class Rotation(ContractModel):
    """Euler angles in degrees, applied in the order y, x, z."""

    x: float = Field(default=0, ge=-180, le=180)
    y: float = Field(default=0, ge=-180, le=180)
    z: float = Field(default=0, ge=-180, le=180)


class Size(ContractModel):
    x: float = Field(default=0.5, ge=0.02, le=2, description="Width.")
    y: float = Field(default=0.5, ge=0.02, le=2, description="Height.")
    z: float = Field(default=0.5, ge=0.02, le=2, description="Depth.")


def node_primitive_triangles(
    primitive: NodePrimitive, sides: int, taper: float, bevel: float = 0, profile_points: int = 0
) -> int:
    """Triangles of one node. box 12; cylinder 4n; cone 2n; sphere 80; prism 4n (2n when it ends in a point, taper = 0);
    gable 8."""
    if primitive == "box":
        return BEVELLED_BOX_TRIANGLES if bevel > 0 else 12
    if primitive == "extrude":
        return 4 * profile_points - 4  # two fan caps of n - 2 triangles, n side quads
    if primitive == "cylinder":
        return 4 * sides
    if primitive == "cone":
        return 2 * sides
    if primitive == "sphere":
        return SPHERE_SEGMENTS * (2 * SPHERE_RINGS - 2)
    if primitive == "gable":
        return GABLE_TRIANGLES
    return 4 * sides if taper > 0 else 2 * sides


class PartMaterial(ContractModel):
    """Look of one part. A colour tints the object's own colour (white keeps it); it never replaces it."""

    color: PartHex | None = Field(default=None, description="Hex tint of the part. Wins over `color_role`.")
    color_role: PartColorRole | None = Field(default=None, description="Tint taken from the template palette.")
    emissive: float = Field(default=0, ge=0, le=1, description="Glow: 0 none, 1 about 60 % brighter.")
    roughness: float | None = Field(default=None, ge=0, le=1, description="0 mirror-like, 1 matte (lit material only).")
    texture: PartTexture = Field(default="none", description="Procedural pattern drawn by the shader (no image file).")


def _is_convex(points: list[Point2]) -> bool:
    """True when the outline turns the same way at every corner (collinear points allowed) and has an area."""
    n = len(points)
    sign = 0
    area2 = 0.0
    for i in range(n):
        a, b, c = points[i], points[(i + 1) % n], points[(i + 2) % n]
        cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)
        area2 += a.x * b.z - b.x * a.z
        if abs(cross) < 1e-9:
            continue
        step = 1 if cross > 0 else -1
        if sign and step != sign:
            return False
        sign = step
    return abs(area2) > 1e-6


class PartNode(ContractModel):
    """A named part of an object, edited like a Blender outliner entry.

    Nodes are a flat list; `parent` names an earlier node. A child's position and rotation are in its parent's local
    space (the parent's size is not inherited). `position` is the centre of the node's base: y = 0 stands it on the
    object's base (or on its parent's origin).
    """

    id: NodeId
    name: NodeName
    primitive: NodePrimitive = "box"
    parent: NodeId | None = None
    hidden: bool = False
    position: Vec3 = Vec3()
    rotation: Rotation = Rotation()
    size: Size = Size()
    sides: int = Field(default=8, ge=3, le=12, description="cylinder, cone, prism: number of sides.")
    taper: float = Field(default=1, ge=0, le=1, description="prism: top radius / bottom radius; 0 ends in a point.")
    material: PartMaterial = PartMaterial()
    bevel: float = Field(default=0, ge=0, le=0.45, description="box: chamfer of the edges as a share of each side.")
    profile: list[Point2] = Field(
        default=[], max_length=MAX_PROFILE_POINTS, description="extrude: convex outline, 3 to 12 points, any winding."
    )
    operation: NodeOperation = Field(
        default="add",
        description="add: its own solid. union / subtract: merged into, or cut out of, the solid of its parent.",
    )

    @model_validator(mode="after")
    def _shape_fields(self) -> "PartNode":
        if self.primitive == "extrude":
            if not 3 <= len(self.profile) <= MAX_PROFILE_POINTS:
                raise ValueError("extrude needs a profile of 3 to 12 points")
            if not _is_convex(self.profile):
                raise ValueError("extrude profile must be convex and not flat")
        if self.operation != "add" and self.parent is None:
            raise ValueError("union and subtract need a parent part")
        return self

    def triangle_count(self) -> int:
        if self.hidden:
            return 0
        own = node_primitive_triangles(self.primitive, self.sides, self.taper, self.bevel, len(self.profile))
        return own + (BOOLEAN_EXTRA_TRIANGLES if self.operation != "add" else 0)


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
    parts: list[Part] = Field(default=[], max_length=8, description="Legacy operations; `nodes` is the editable form.")
    nodes: list[PartNode] = Field(
        default=[], max_length=MAX_NODES, description="Part tree (flat, parents first). Built after `parts`."
    )
    budget: ShapeBudget = ShapeBudget()
    footprint: float = Field(
        default=DEFAULT_FOOTPRINT_M,
        ge=0.1,
        le=1.5,
        description="Side of the unit footprint in metres on the plate: wide shapes (a whale, a wreck) use more.",
    )
    height_scale: float = Field(
        default=1,
        ge=0.1,
        le=2,
        description="Multiplies the instance height (0.5 to 1.5 m by default): below 1 makes a squat shape.",
    )

    def triangle_count(self) -> int:
        return sum(p.triangle_count() for p in self.parts) + sum(n.triangle_count() for n in self.nodes)

    @model_validator(mode="after")
    def _node_tree(self) -> "ShapeRecipe":
        if not self.parts and not self.nodes:
            raise ValueError("recipe needs at least one part or node")
        depth: dict[str, int] = {}
        operation = {n.id: n.operation for n in self.nodes}
        for node in self.nodes:
            if node.id in depth:
                raise ValueError(f"nodes: duplicate id {node.id}")
            if node.parent is None:
                depth[node.id] = 1
                continue
            if node.parent not in depth:
                raise ValueError(f"nodes: parent {node.parent} of {node.id} must be an earlier node")
            if node.operation != "add" and operation[node.parent] != "add":
                raise ValueError(f"nodes: {node.id} cannot combine into {node.parent}, which is itself combined")
            depth[node.id] = depth[node.parent] + 1
            if depth[node.id] > MAX_NODE_DEPTH:
                raise ValueError(f"nodes: {node.id} is deeper than {MAX_NODE_DEPTH} levels")
        return self

    @model_validator(mode="after")
    def _within_budget(self) -> "ShapeRecipe":
        triangles = self.triangle_count()
        if triangles > self.budget.max_triangles:
            raise ValueError(f"recipe needs {triangles} triangles, budget is {self.budget.max_triangles}")
        return self
