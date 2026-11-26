/**
 * ShapeRecipe builder (`music-world.shape.v1`): a recipe from the director becomes one BufferGeometry.
 *
 * Deterministic: the same recipe always gives the same vertices (clusters use the seeded `mulberry32`). The result
 * follows the builtin shape convention: unit footprint on x/z centred on 0, base at y = 0, height exactly 1, no
 * normals or uvs (MeshBasicMaterial). Triangle counts mirror `ShapeRecipe.triangle_count` in
 * `apps/api/music_world/schemas/shape.py`; a parity test compares both on shared fixtures.
 *
 * A recipe that does not validate against its own budget is never built: `buildRecipeGeometry` returns null and the
 * caller falls back to a plain box (the zod schema does not re-check pydantic validators).
 */
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '@/engine/prng';
import { buildNodeGeometries, type PartPalette } from './node-builder';
import { TEXTURE_ATTRIBUTE } from './part-textures';
import type { Template } from '@/templates/generated';

export type ShapeRecipe = NonNullable<Template['recipes']>[number];
type Part = ShapeRecipe['parts'][number];
type Primitive = 'box' | 'prism' | 'spike';

/** Defaults of `Part` in the pydantic contract; an omitted field means the same thing on both sides. */
const D = {
  of: 'box',
  width: 0.5,
  depth: 0.5,
  height: 0.5,
  y: 0,
  sides: 6,
  taper: 1,
  levels: 3,
  shrink: 0.8,
  count: 4,
  spread: 0.6,
  seedOffset: 0,
} as const;
const DEFAULT_MAX_TRIANGLES = 300;
const SPIKE_SIDES = 4;
/** Cluster copies are this fraction of the part's width, and vary in height between these fractions. */
const CLUSTER_SCALE = 0.5;
const CLUSTER_MIN_HEIGHT = 0.6;
/** Ring radius of a cluster at spread 1, in unit-footprint terms (keeps copies inside the footprint). */
const CLUSTER_RING = 0.35;

interface Frame {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly y: number;
  readonly sides: number;
  readonly taper: number;
}

function primitive(of: Primitive, f: Frame, x = 0, z = 0): BufferGeometry {
  let g: BufferGeometry;
  if (of === 'box') g = new BoxGeometry(f.width, f.height, f.depth);
  else if (of === 'spike') g = new ConeGeometry(f.width / 2, f.height, SPIKE_SIDES, 1, true);
  else g = new CylinderGeometry((f.width / 2) * f.taper, f.width / 2, f.height, f.sides, 1, false);
  g.translate(x, f.y + f.height / 2, z);
  const flat = g.index ? g.toNonIndexed() : g;
  flat.deleteAttribute('normal');
  flat.deleteAttribute('uv');
  return flat;
}

function frameOf(part: Part): Frame {
  return {
    width: part.width ?? D.width,
    depth: part.depth ?? D.depth,
    height: part.height ?? D.height,
    y: part.y ?? D.y,
    sides: part.sides ?? D.sides,
    taper: part.taper ?? D.taper,
  };
}

function stack(part: Part): BufferGeometry[] {
  const f = frameOf(part);
  const levels = part.levels ?? D.levels;
  const shrink = part.shrink ?? D.shrink;
  const floor = f.height / levels;
  return Array.from({ length: levels }, (_, i) => {
    const s = shrink ** i;
    return primitive(part.of ?? D.of, {
      ...f,
      width: f.width * s,
      depth: f.depth * s,
      height: floor,
      y: f.y + i * floor,
      taper: 1,
    });
  });
}

function cluster(part: Part): BufferGeometry[] {
  const f = frameOf(part);
  const count = part.count ?? D.count;
  const spread = part.spread ?? D.spread;
  const rng = mulberry32(((part.seedOffset ?? D.seedOffset) + 1) * 0x9e3779b1);
  const turn = rng() * Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const angle = turn + (i / count) * Math.PI * 2;
    const radius = spread * CLUSTER_RING * (0.4 + 0.6 * rng());
    const height = f.height * (CLUSTER_MIN_HEIGHT + (1 - CLUSTER_MIN_HEIGHT) * rng());
    const copy = { ...f, width: f.width * CLUSTER_SCALE, depth: f.depth * CLUSTER_SCALE, height };
    return primitive(part.of ?? D.of, copy, Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function partGeometries(part: Part): BufferGeometry[] {
  switch (part.op) {
    case 'stack':
      return stack(part);
    case 'cluster':
      return cluster(part);
    default:
      return [primitive(part.op, frameOf(part))];
  }
}

/** Builds the recipe's geometry, or null when it is empty or over its own triangle budget. */
export function buildRecipeGeometry(recipe: ShapeRecipe, palette?: PartPalette): BufferGeometry | null {
  const pieces = [...(recipe.parts ?? []).flatMap(partGeometries), ...buildNodeGeometries(recipe.nodes ?? [], palette)];
  // Merging needs the same attributes everywhere: legacy parts get white (no tint) when a node is painted.
  if (pieces.some((g) => g.hasAttribute('color'))) {
    for (const g of pieces) {
      if (g.hasAttribute('color')) continue;
      g.setAttribute('color', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
    }
  }
  if (pieces.some((g) => g.hasAttribute(TEXTURE_ATTRIBUTE))) {
    for (const g of pieces) {
      if (!g.hasAttribute(TEXTURE_ATTRIBUTE)) g.setAttribute(TEXTURE_ATTRIBUTE, new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    }
  }
  const merged = pieces.length > 0 ? mergeGeometries(pieces) : null;
  if (!merged) return null;
  const triangles = merged.getAttribute('position').count / 3;
  if (triangles > (recipe.budget?.maxTriangles ?? DEFAULT_MAX_TRIANGLES)) {
    merged.dispose();
    return null;
  }
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const height = box.max.y - box.min.y;
  return height > 0 ? merged.translate(0, -box.min.y, 0).scale(1, 1 / height, 1) : null;
}

/** Mean roughness of the visible parts that set one (the lit material has a single value per kind), or null. */
export function recipeRoughness(recipe: ShapeRecipe): number | null {
  const set = (recipe.nodes ?? []).filter((n) => !n.hidden && typeof n.material?.roughness === 'number');
  return set.length === 0 ? null : set.reduce((sum, n) => sum + n.material!.roughness!, 0) / set.length;
}
