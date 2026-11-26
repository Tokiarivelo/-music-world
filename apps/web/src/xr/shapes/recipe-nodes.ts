/**
 * Migration of legacy recipe operations (`parts`) to the editable part tree (`nodes`). The result builds the same shape
 * with `buildRecipeGeometry`, except that a spike gains a bottom cap (4 more triangles): the node cone is closed.
 * Returns null when the tree would exceed the node limit (a stack of 8 floors in each of 8 parts, for instance).
 */
import { mulberry32 } from "@/engine/prng";
import type { PartNode } from "./node-builder";
import type { ShapeRecipe } from "./recipe-builder";

type Part = ShapeRecipe["parts"][number];
type Primitive = "box" | "prism" | "spike";
export const MAX_NODES = 48;
const CLUSTER_SCALE = 0.5;
const CLUSTER_MIN_HEIGHT = 0.6;
const CLUSTER_RING = 0.35;

interface Frame {
  width: number;
  depth: number;
  height: number;
  y: number;
  sides: number;
  taper: number;
}

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });

function nodeOf(
  id: string,
  name: string,
  of: Primitive,
  f: Frame,
  x = 0,
  z = 0,
): PartNode {
  const base = {
    id,
    name,
    hidden: false,
    position: vec(x, f.y, z),
    rotation: vec(),
    size: vec(f.width, f.height, f.depth),
  };
  if (of === "box") return { ...base, primitive: "box", sides: 8, taper: 1 };
  if (of === "spike")
    return {
      ...base,
      primitive: "cone",
      size: vec(f.width, f.height, f.width),
      sides: 4,
      taper: 1,
    };
  return {
    ...base,
    primitive: "prism",
    size: vec(f.width, f.height, f.width),
    sides: f.sides,
    taper: f.taper,
  };
}

function partNodes(part: Part, index: number): PartNode[] {
  const f: Frame = {
    width: part.width ?? 0.5,
    depth: part.depth ?? 0.5,
    height: part.height ?? 0.5,
    y: part.y ?? 0,
    sides: part.sides ?? 6,
    taper: part.taper ?? 1,
  };
  const id = (k: number) => `p${index + 1}_${k + 1}`;
  const label = `${part.op[0]!.toUpperCase()}${part.op.slice(1)} ${index + 1}`;
  if (part.op === "stack") {
    const levels = part.levels ?? 3;
    const shrink = part.shrink ?? 0.8;
    const floor = f.height / levels;
    return Array.from({ length: levels }, (_, i) =>
      nodeOf(id(i), `${label} floor ${i + 1}`, part.of ?? "box", {
        ...f,
        width: f.width * shrink ** i,
        depth: f.depth * shrink ** i,
        height: floor,
        y: f.y + i * floor,
        taper: 1,
      }),
    );
  }
  if (part.op === "cluster") {
    const count = part.count ?? 4;
    const spread = part.spread ?? 0.6;
    const rng = mulberry32(((part.seedOffset ?? 0) + 1) * 0x9e3779b1);
    const turn = rng() * Math.PI * 2;
    return Array.from({ length: count }, (_, i) => {
      const angle = turn + (i / count) * Math.PI * 2;
      const radius = spread * CLUSTER_RING * (0.4 + 0.6 * rng());
      const height =
        f.height * (CLUSTER_MIN_HEIGHT + (1 - CLUSTER_MIN_HEIGHT) * rng());
      const copy = {
        ...f,
        width: f.width * CLUSTER_SCALE,
        depth: f.depth * CLUSTER_SCALE,
        height,
      };
      return nodeOf(
        id(i),
        `${label} copy ${i + 1}`,
        part.of ?? "box",
        copy,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    });
  }
  return [nodeOf(id(0), label, part.op, f)];
}

/** The recipe with its operations turned into nodes (`parts` emptied), or null when it would not fit. */
export function recipeToNodes(recipe: ShapeRecipe): ShapeRecipe | null {
  const nodes = [
    ...(recipe.nodes ?? []),
    ...(recipe.parts ?? []).flatMap(partNodes),
  ];
  return nodes.length > MAX_NODES ? null : { ...recipe, parts: [], nodes };
}
