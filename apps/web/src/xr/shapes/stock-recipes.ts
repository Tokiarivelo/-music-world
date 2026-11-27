/**
 * Stock objects as part-tree recipes, so they open in the object editor (spec 12). They follow the proportions of the
 * runtime builtin kinds (`house-shapes.ts`, `object-shapes.ts`) in simplified form: the world keeps rendering its own
 * lit geometries (window shaders and baked colours need normals); these recipes are the editable copies a creator
 * starts from. All sizes are in the unit footprint, height normalised to 1 by `buildRecipeGeometry`.
 */
import { plainMaterial, type PartNode } from "./node-builder";
import type { ShapeRecipe } from "./recipe-builder";

export type Spec = Pick<PartNode, "id" | "name" | "primitive"> &
  Partial<Pick<PartNode, "parent" | "sides" | "taper" | "hidden">> & {
    size: [number, number, number];
    at?: [number, number, number];
    rot?: [number, number, number];
  };

function node(s: Spec): PartNode {
  const [x, y, z] = s.at ?? [0, 0, 0];
  const [rx, ry, rz] = s.rot ?? [0, 0, 0];
  return {
    id: s.id,
    name: s.name,
    primitive: s.primitive,
    parent: s.parent ?? null,
    hidden: s.hidden ?? false,
    position: { x, y, z },
    rotation: { x: rx, y: ry, z: rz },
    size: { x: s.size[0], y: s.size[1], z: s.size[2] },
    sides: s.sides ?? 8,
    taper: s.taper ?? 1,
    material: plainMaterial(), bevel: 0, profile: [], operation: "add" as const,
  };
}

export function recipe(
  name: string,
  nodes: Spec[],
  footprint: number,
  heightScale = 1,
): ShapeRecipe {
  return {
    schema: "music-world.shape.v1",
    name,
    parts: [],
    nodes: nodes.map(node),
    variants: [],
    budget: { maxTriangles: 500 },
    footprint,
    heightScale,
  };
}

export const STOCK_RECIPES: readonly ShapeRecipe[] = [
  recipe(
    "house",
    [
      { id: "walls", name: "Walls", primitive: "box", size: [0.84, 0.5, 0.64] },
      {
        id: "roof",
        name: "Roof",
        primitive: "gable",
        parent: "walls",
        at: [0, 0.5, 0],
        size: [0.92, 0.32, 0.72],
      },
      {
        id: "chimney",
        name: "Chimney",
        primitive: "box",
        parent: "walls",
        at: [0.26, 0.5, -0.12],
        size: [0.1, 0.34, 0.1],
      },
      {
        id: "door",
        name: "Door",
        primitive: "box",
        parent: "walls",
        at: [0, 0, 0.32],
        size: [0.14, 0.26, 0.04],
      },
      {
        id: "window_l",
        name: "Window left",
        primitive: "box",
        parent: "walls",
        at: [-0.26, 0.2, 0.32],
        size: [0.14, 0.14, 0.04],
      },
      {
        id: "window_r",
        name: "Window right",
        primitive: "box",
        parent: "walls",
        at: [0.26, 0.2, 0.32],
        size: [0.14, 0.14, 0.04],
      },
    ],
    0.4,
  ),
  recipe(
    "tower",
    [
      { id: "body", name: "Body", primitive: "box", size: [0.7, 0.7, 0.7] },
      {
        id: "setback",
        name: "Set-back top",
        primitive: "box",
        parent: "body",
        at: [0, 0.7, 0],
        size: [0.46, 0.2, 0.46],
      },
      {
        id: "antenna",
        name: "Antenna",
        primitive: "cone",
        parent: "setback",
        at: [0, 0.2, 0],
        size: [0.1, 0.3, 0.1],
        sides: 6,
      },
    ],
    0.3,
  ),
  recipe(
    "tree",
    [
      {
        id: "trunk",
        name: "Trunk",
        primitive: "cylinder",
        size: [0.14, 0.4, 0.14],
        sides: 6,
      },
      {
        id: "crown",
        name: "Crown",
        primitive: "sphere",
        parent: "trunk",
        at: [0, 0.28, 0],
        size: [0.7, 0.62, 0.7],
      },
      {
        id: "crown_top",
        name: "Crown top",
        primitive: "sphere",
        parent: "crown",
        at: [0.06, 0.38, 0.04],
        size: [0.4, 0.36, 0.4],
      },
    ],
    0.5,
  ),
  recipe(
    "conifer",
    [
      {
        id: "trunk",
        name: "Trunk",
        primitive: "cylinder",
        size: [0.1, 0.22, 0.1],
        sides: 6,
      },
      {
        id: "tier_1",
        name: "Tier 1",
        primitive: "cone",
        parent: "trunk",
        at: [0, 0.14, 0],
        size: [0.7, 0.4, 0.7],
        sides: 7,
      },
      {
        id: "tier_2",
        name: "Tier 2",
        primitive: "cone",
        parent: "trunk",
        at: [0, 0.4, 0],
        size: [0.52, 0.36, 0.52],
        sides: 7,
      },
      {
        id: "tier_3",
        name: "Tier 3",
        primitive: "cone",
        parent: "trunk",
        at: [0, 0.64, 0],
        size: [0.34, 0.32, 0.34],
        sides: 7,
      },
    ],
    0.45,
  ),
  recipe(
    "car",
    [
      {
        id: "body",
        name: "Body",
        primitive: "box",
        at: [0, 0.2, 0],
        size: [0.9, 0.3, 0.46],
      },
      {
        id: "cabin",
        name: "Cabin",
        primitive: "box",
        parent: "body",
        at: [-0.04, 0.3, 0],
        size: [0.5, 0.26, 0.4],
      },
      {
        id: "wheel_fl",
        name: "Wheel front left",
        primitive: "cylinder",
        parent: "body",
        at: [0.28, -0.08, 0.2],
        rot: [90, 0, 0],
        size: [0.2, 0.08, 0.2],
        sides: 8,
      },
      {
        id: "wheel_fr",
        name: "Wheel front right",
        primitive: "cylinder",
        parent: "body",
        at: [0.28, -0.08, -0.2],
        rot: [-90, 0, 0],
        size: [0.2, 0.08, 0.2],
        sides: 8,
      },
      {
        id: "wheel_bl",
        name: "Wheel back left",
        primitive: "cylinder",
        parent: "body",
        at: [-0.28, -0.08, 0.2],
        rot: [90, 0, 0],
        size: [0.2, 0.08, 0.2],
        sides: 8,
      },
      {
        id: "wheel_br",
        name: "Wheel back right",
        primitive: "cylinder",
        parent: "body",
        at: [-0.28, -0.08, -0.2],
        rot: [-90, 0, 0],
        size: [0.2, 0.08, 0.2],
        sides: 8,
      },
    ],
    0.5,
    0.6,
  ),
];
