/**
 * Part-tree builder (`PartNode` of `music-world.shape.v1`): the editable form of a recipe becomes BufferGeometries.
 *
 * Pure and deterministic. Every node is a primitive scaled to its size, standing on y = 0 (base at the node's
 * position), rotated (Euler order y, x, z) and moved into its parent's local frame; a parent's size is not inherited.
 * A hidden node is skipped but its children keep their place. Triangle counts mirror `node_primitive_triangles` in
 * `apps/api/music_world/schemas/shape.py`; the shared fixtures in `apps/api/tests/fixtures/shape-recipes.json` check it.
 */
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import type { Template } from "@/templates/generated";
import { combine } from "./node-csg";
import { TEXTURE_ATTRIBUTE, textureId } from "./part-textures";

type Recipe = NonNullable<Template["recipes"]>[number];
export type PartNode = Recipe["nodes"][number];
export type NodePrimitive = PartNode["primitive"];

/** Mirrored by `SPHERE_SEGMENTS` / `SPHERE_RINGS` in the pydantic contract. */
export const SPHERE_SEGMENTS = 8;
export const SPHERE_RINGS = 6;
const DEG = Math.PI / 180;

/** A triangular prism with its ridge along z: width x, ridge height y, depth z. 8 triangles. */
function gable(): BufferGeometry {
  const b0 = [-0.5, 0, -0.5],
    b1 = [0.5, 0, -0.5],
    b2 = [0.5, 0, 0.5],
    b3 = [-0.5, 0, 0.5];
  const r0 = [0, 1, -0.5],
    r1 = [0, 1, 0.5];
  const tris = [
    b1,
    b0,
    r0, // front end
    b3,
    b2,
    r1, // back end
    b1,
    r0,
    r1,
    b1,
    r1,
    b2, // right slope
    b3,
    r1,
    r0,
    b3,
    r0,
    b0, // left slope
    b0,
    b1,
    b2,
    b0,
    b2,
    b3, // bottom
  ];
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(tris.flat(), 3));
  return g;
}

/** Triangles of the solid, with the winding fixed so every face looks away from `centre` (the solid is convex). */
function outward(tris: number[][][], centre: number[]): number[] {
  const out: number[] = [];
  for (const [a, b, c] of tris) {
    const n = [
      (b![1]! - a![1]!) * (c![2]! - a![2]!) - (b![2]! - a![2]!) * (c![1]! - a![1]!),
      (b![2]! - a![2]!) * (c![0]! - a![0]!) - (b![0]! - a![0]!) * (c![2]! - a![2]!),
      (b![0]! - a![0]!) * (c![1]! - a![1]!) - (b![1]! - a![1]!) * (c![0]! - a![0]!),
    ];
    const away = n[0]! * (a![0]! - centre[0]!) + n[1]! * (a![1]! - centre[1]!) + n[2]! * (a![2]! - centre[2]!);
    out.push(...(away >= 0 ? [...a!, ...b!, ...c!] : [...a!, ...c!, ...b!]));
  }
  return out;
}

/** A unit box with every edge chamfered by `b` (share of a side): 6 faces, 12 edge strips, 8 corners = 44 triangles. */
function bevelledBox(b: number): BufferGeometry {
  const h = 0.5;
  const k = h - Math.min(0.45, b);
  const sign = [-1, 1];
  // The vertex of corner (sx, sy, sz) that belongs to the face along `axis`.
  const v = (sx: number, sy: number, sz: number, axis: 0 | 1 | 2): number[] => {
    const s = [sx, sy, sz];
    return s.map((c, i) => (i === axis ? c * h : c * k));
  };
  const tris: number[][][] = [];
  for (const axis of [0, 1, 2] as const) {
    for (const s of sign) {
      const [u, w] = ([0, 1, 2] as const).filter((i) => i !== axis);
      const corner = (cu: number, cw: number) => {
        const c = [0, 0, 0];
        c[axis] = s;
        c[u!] = cu;
        c[w!] = cw;
        return v(c[0]!, c[1]!, c[2]!, axis);
      };
      tris.push([corner(-1, -1), corner(1, -1), corner(1, 1)], [corner(-1, -1), corner(1, 1), corner(-1, 1)]);
    }
  }
  // Edge strips: between the two faces sharing an edge (axes p and q), along the third axis.
  for (const [p, q, r] of [[0, 1, 2], [0, 2, 1], [1, 2, 0]] as const) {
    for (const sp of sign) for (const sq of sign) {
      const at = (sr: number, axis: 0 | 1 | 2) => {
        const c = [0, 0, 0];
        c[p] = sp;
        c[q] = sq;
        c[r] = sr;
        return v(c[0]!, c[1]!, c[2]!, axis);
      };
      tris.push([at(-1, p), at(1, p), at(1, q)], [at(-1, p), at(1, q), at(-1, q)]);
    }
  }
  for (const sx of sign) for (const sy of sign) for (const sz of sign) {
    tris.push([v(sx, sy, sz, 0), v(sx, sy, sz, 1), v(sx, sy, sz, 2)]);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(outward(tris, [0, 0, 0]), 3));
  g.translate(0, 0.5, 0);
  return g;
}

/** A convex outline (unit footprint, x/z) extruded from y = 0 to y = 1: two fan caps and one quad per edge. */
function extrusion(profile: readonly { x: number; z: number }[]): BufferGeometry {
  const n = profile.length;
  const tris: number[][][] = [];
  const at = (i: number, y: number) => [profile[i]!.x, y, profile[i]!.z];
  for (let i = 1; i + 1 < n; i++) tris.push([at(0, 0), at(i, 0), at(i + 1, 0)], [at(0, 1), at(i, 1), at(i + 1, 1)]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([at(i, 0), at(j, 0), at(j, 1)], [at(i, 0), at(j, 1), at(i, 1)]);
  }
  const cx = profile.reduce((s, p) => s + p.x, 0) / n;
  const cz = profile.reduce((s, p) => s + p.z, 0) / n;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(outward(tris, [cx, 0.5, cz]), 3));
  return g;
}

/** The primitive at unit size, base on y = 0, footprint centred on x/z; non-indexed, positions only. */
function unitPrimitive(node: PartNode): BufferGeometry {
  const sides = node.sides ?? 8;
  const taper = node.taper ?? 1;
  let g: BufferGeometry;
  switch (node.primitive) {
    case "cylinder":
      g = new CylinderGeometry(0.5, 0.5, 1, sides);
      break;
    case "cone":
      g = new ConeGeometry(0.5, 1, sides);
      break;
    case "sphere":
      g = new SphereGeometry(0.5, SPHERE_SEGMENTS, SPHERE_RINGS);
      break;
    case "prism":
      g = new CylinderGeometry(0.5 * taper, 0.5, 1, sides);
      break;
    case "gable":
      return gable();
    case "extrude":
      return extrusion(node.profile ?? []);
    default:
      if ((node.bevel ?? 0) > 0) return bevelledBox(node.bevel!);
      g = new BoxGeometry(1, 1, 1);
  }
  g.translate(0, 0.5, 0);
  const flat = g.index ? g.toNonIndexed() : g;
  flat.deleteAttribute("normal");
  flat.deleteAttribute("uv");
  return flat;
}

function localMatrix(node: PartNode): Matrix4 {
  const r = node.rotation;
  const q = new Quaternion().setFromEuler(
    new Euler((r?.x ?? 0) * DEG, (r?.y ?? 0) * DEG, (r?.z ?? 0) * DEG, "YXZ"),
  );
  const p = node.position;
  return new Matrix4().compose(
    new Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0),
    q,
    new Vector3(1, 1, 1),
  );
}

/** Object-space matrix of every node (position and rotation down the parent chain; a parent's size is not inherited). */
export function nodeWorldMatrices(nodes: readonly PartNode[]): Map<string, Matrix4> {
  const world = new Map<string, Matrix4>();
  for (const node of nodes) {
    const parent = node.parent ? world.get(node.parent) : undefined;
    world.set(node.id, (parent ? parent.clone() : new Matrix4()).multiply(localMatrix(node)));
  }
  return world;
}

/** A part with no tint, no glow and the kind's own roughness. */
export const plainMaterial = (): PartNode["material"] => ({ color: null, colorRole: null, emissive: 0, roughness: null, texture: "none" });

/** Palette roles a part can take its tint from (`PartMaterial.colorRole`). */
export type PartPalette = Partial<Record<string, string>>;
/** `emissive` 1 multiplies the colour by 1 + this. Vertex colours are not clamped by the unlit or the lit material. */
export const EMISSIVE_BOOST = 0.6;

/** RGB of a part's tint and glow; white (no change) when it has neither. Colours are in linear space like three's. */
export function partTint(node: PartNode, palette?: PartPalette): [number, number, number] {
  const m = node.material;
  const hex = m?.color ?? (m?.colorRole ? palette?.[m.colorRole] : undefined);
  const c = new Color(hex ?? "#ffffff");
  const k = 1 + EMISSIVE_BOOST * (m?.emissive ?? 0);
  return [c.r * k, c.g * k, c.b * k];
}

/** True when any visible node changes the object's colour or glows. */
export function hasPartLook(nodes: readonly PartNode[]): boolean {
  return nodes.some((n) => !n.hidden && (n.material?.color || n.material?.colorRole || (n.material?.emissive ?? 0) > 0));
}

export interface NodePiece {
  /** The node whose look (colour, texture) the triangles take. */
  readonly id: string;
  readonly geometry: BufferGeometry;
}

function positionsOf(g: BufferGeometry): ArrayLike<number> {
  return g.getAttribute("position").array;
}

function geometryOf(positions: ArrayLike<number>): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(Float32Array.from(positions as ArrayLike<number>), 3));
  return g;
}

/**
 * Geometries of the visible nodes, in object space, in list order. A node with `union` / `subtract` is merged into its
 * parent (see `node-csg.ts`): it gives no piece of its own except the faces of a union that stay visible.
 */
export function buildNodePieces(nodes: readonly PartNode[], palette?: PartPalette): NodePiece[] {
  const painted = hasPartLook(nodes);
  const textured = nodes.some((n) => !n.hidden && textureId(n.material?.texture) > 0);
  const world = new Map<string, Matrix4>();
  const solid = new Map<string, BufferGeometry>();
  for (const node of nodes) {
    const parent = node.parent ? world.get(node.parent) : undefined;
    const matrix = (parent ? parent.clone() : new Matrix4()).multiply(localMatrix(node));
    world.set(node.id, matrix);
    const s = node.size;
    const g = unitPrimitive(node);
    g.scale(s?.x ?? 0.5, s?.y ?? 0.5, s?.z ?? 0.5);
    g.applyMatrix4(matrix);
    solid.set(node.id, g);
  }
  const combined = (n: PartNode) => (n.operation ?? "add") !== "add" && !!n.parent && solid.has(n.parent);
  const pieces: NodePiece[] = [];
  for (const node of nodes) {
    if (combined(node) || node.hidden) continue;
    const operands = nodes.filter((c) => combined(c) && c.parent === node.id && !c.hidden);
    if (operands.length === 0) {
      pieces.push({ id: node.id, geometry: solid.get(node.id)! });
      continue;
    }
    const merged = combine(
      positionsOf(solid.get(node.id)!),
      operands.map((c) => ({ operation: c.operation as "union" | "subtract", positions: positionsOf(solid.get(c.id)!) })),
    );
    pieces.push({ id: node.id, geometry: geometryOf(merged.base) });
    operands.forEach((c, k) => {
      if (c.operation === "union" && merged.children[k]!.length > 0) pieces.push({ id: c.id, geometry: geometryOf(merged.children[k]!) });
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const { id, geometry: g } of pieces) {
    const node = byId.get(id)!;
    const count = g.getAttribute("position").count;
    if (painted) {
      const [r, gr, b] = partTint(node, palette);
      const colors = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) colors.set([r, gr, b], v * 3);
      g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    }
    if (textured) {
      g.setAttribute(TEXTURE_ATTRIBUTE, new Float32BufferAttribute(new Float32Array(count).fill(textureId(node.material?.texture)), 1));
    }
  }
  for (const g of solid.values()) if (!pieces.some((p) => p.geometry === g)) g.dispose();
  return pieces;
}

/** One geometry per visible node (see `buildNodePieces`). */
export function buildNodeGeometries(nodes: readonly PartNode[], palette?: PartPalette): BufferGeometry[] {
  return buildNodePieces(nodes, palette).map((p) => p.geometry);
}
