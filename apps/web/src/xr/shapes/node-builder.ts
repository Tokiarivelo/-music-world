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
    default:
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

/** One geometry per visible node, in world (object) space, in list order. */
export function buildNodeGeometries(
  nodes: readonly PartNode[],
  palette?: PartPalette,
): BufferGeometry[] {
  const painted = hasPartLook(nodes);
  const textured = nodes.some((n) => !n.hidden && textureId(n.material?.texture) > 0);
  const world = new Map<string, Matrix4>();
  const out: BufferGeometry[] = [];
  for (const node of nodes) {
    const parent = node.parent ? world.get(node.parent) : undefined;
    const matrix = (parent ? parent.clone() : new Matrix4()).multiply(
      localMatrix(node),
    );
    world.set(node.id, matrix);
    if (node.hidden) continue;
    const s = node.size;
    const g = unitPrimitive(node);
    g.scale(s?.x ?? 0.5, s?.y ?? 0.5, s?.z ?? 0.5);
    g.applyMatrix4(matrix);
    if (painted) {
      const [r, gr, b] = partTint(node, palette);
      const count = g.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) colors.set([r, gr, b], v * 3);
      g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    }
    if (textured) {
      const count = g.getAttribute("position").count;
      g.setAttribute(TEXTURE_ATTRIBUTE, new Float32BufferAttribute(new Float32Array(count).fill(textureId(node.material?.texture)), 1));
    }
    out.push(g);
  }
  return out;
}
