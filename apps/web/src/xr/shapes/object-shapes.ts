/**
 * Object kinds of the world beyond buildings (I8): cloud, tree, conifer, bush, car, bicycle, airplane. Self-made,
 * procedural, low-poly with baked vertex colors (no outside asset, no licence). Each is built in metres at its nominal
 * size, then normalised to the unit footprint / unit height that `buildShapeGeometry` promises, so the instance scale
 * (`KIND_FOOTPRINT`, `KIND_HEIGHT`) gives back the right proportions. One merged geometry per kind, under the
 * `SHAPE_TRIANGLE_BUDGET`.
 */
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Rgb = readonly [number, number, number];

const WHITE: Rgb = [1, 1, 1];
const SHADE: Rgb = [0.78, 0.8, 0.86];
const TRUNK: Rgb = [0.42, 0.28, 0.16];
const LEAF: Rgb = [0.55, 0.85, 0.5];
const LEAF_DARK: Rgb = [0.35, 0.65, 0.42];
const TIRE: Rgb = [0.08, 0.08, 0.1];
const GLASS: Rgb = [0.55, 0.7, 0.85];
const BODY: Rgb = [1, 0.95, 0.9];
const HEADLIGHT: Rgb = [1, 0.97, 0.8];
const TAILLIGHT: Rgb = [0.9, 0.1, 0.1];
const METAL: Rgb = [0.75, 0.78, 0.82];

/** A part: non-indexed, smooth normals kept (lit PBR material), no uv, one vertex color (the instance color tints it). */
function colored(geometry: BufferGeometry, rgb: Rgb): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set(rgb, i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

/** Baked ambient occlusion: vertex colors darken toward the ground (and into crevices) by up to `strength`. */
function bakeOcclusion(geometry: BufferGeometry, height: number, strength: number): void {
  const pos = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - strength * (1 - Math.min(1, Math.max(0, pos.getY(i) / height))) ** 2;
    color.setXYZ(i, color.getX(i) * k, color.getY(i) * k, color.getZ(i) * k);
  }
}

/**
 * Merges the parts and fits them in the unit footprint (x, z) and the unit height, base at y = 0. The proportions of
 * each kind are fixed by its `KIND_FOOTPRINT` / `KIND_HEIGHT` nominal height (see the comments in `engine/constants.ts`).
 */
function fitUnit(parts: readonly BufferGeometry[], occlusion = 0.35): BufferGeometry {
  const merged = mergeGeometries([...parts]);
  if (!merged) throw new Error('object shape: nothing to merge');
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const side = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  merged.translate(-(box.max.x + box.min.x) / 2, -box.min.y, -(box.max.z + box.min.z) / 2);
  const height = box.max.y - box.min.y;
  bakeOcclusion(merged, height, occlusion);
  return merged.scale(1 / side, 1 / height, 1 / side);
}

function blob(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  rgb: Rgb,
  w = 10,
  h = 7,
): BufferGeometry {
  return colored(new SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z), rgb);
}

function box(x: number, y: number, z: number, w: number, h: number, d: number, rgb: Rgb): BufferGeometry {
  return colored(new BoxGeometry(w, h, d).translate(x, y, z), rgb);
}

/** Wheel with its axis along z. */
function wheel(x: number, y: number, z: number, r: number, width: number, rgb: Rgb = TIRE): BufferGeometry {
  return colored(new CylinderGeometry(r, r, width, 8).rotateX(Math.PI / 2).translate(x, y, z), rgb);
}

export function cloud(): BufferGeometry {
  // Five overlapping puffs, lighter on top, grey underneath.
  return fitUnit(
    [
      blob(-0.3, 0.1, 0, 0.3, 0.2, 0.25, SHADE, 8, 6),
      blob(0.1, 0.18, 0.02, 0.38, 0.3, 0.3, WHITE, 8, 6),
      blob(0.42, 0.1, -0.03, 0.26, 0.18, 0.22, SHADE, 8, 6),
      blob(-0.05, 0.3, -0.05, 0.24, 0.2, 0.2, WHITE, 8, 6),
      blob(0.25, 0.28, 0.06, 0.2, 0.16, 0.18, WHITE, 8, 6),
    ],
    0.12,
  );
}

export function tree(): BufferGeometry {
  // Broadleaf: trunk and a canopy of three blobs.
  return fitUnit([
    colored(new CylinderGeometry(0.05, 0.08, 0.5, 6).translate(0, 0.25, 0), TRUNK),
    blob(0, 0.72, 0, 0.34, 0.3, 0.34, LEAF),
    blob(0.16, 0.58, 0.1, 0.22, 0.2, 0.22, LEAF_DARK),
    blob(-0.14, 0.6, -0.1, 0.22, 0.2, 0.22, LEAF_DARK),
  ]);
}

export function conifer(): BufferGeometry {
  return fitUnit([
    colored(new CylinderGeometry(0.04, 0.06, 0.2, 6).translate(0, 0.1, 0), TRUNK),
    colored(new ConeGeometry(0.34, 0.45, 8).translate(0, 0.42, 0), LEAF_DARK),
    colored(new ConeGeometry(0.26, 0.4, 8).translate(0, 0.66, 0), LEAF),
    colored(new ConeGeometry(0.17, 0.34, 8).translate(0, 0.88, 0), LEAF_DARK),
  ]);
}

export function bush(): BufferGeometry {
  return fitUnit([
    blob(0, 0.2, 0, 0.3, 0.2, 0.28, LEAF_DARK),
    blob(0.22, 0.17, 0.08, 0.2, 0.16, 0.18, LEAF),
    blob(-0.2, 0.16, -0.06, 0.2, 0.15, 0.18, LEAF),
  ]);
}

export function car(): BufferGeometry {
  // Length along x. Body, cabin with glass, bumpers and lights, four wheels with hubcaps.
  const wheelAt = (x: number, z: number): BufferGeometry[] => [
    wheel(x, 0.1, z, 0.1, 0.08),
    wheel(x, 0.1, z * 1.06, 0.06, 0.08, METAL),
  ];
  return fitUnit([
    box(0, 0.22, 0, 1, 0.22, 0.5, BODY),
    box(-0.05, 0.42, 0, 0.5, 0.2, 0.44, GLASS),
    box(0.5, 0.2, 0, 0.04, 0.08, 0.46, METAL), // front bumper
    box(-0.5, 0.2, 0, 0.04, 0.08, 0.46, METAL), // rear bumper
    box(0.51, 0.28, 0.17, 0.03, 0.05, 0.1, HEADLIGHT),
    box(0.51, 0.28, -0.17, 0.03, 0.05, 0.1, HEADLIGHT),
    box(-0.51, 0.28, 0.17, 0.03, 0.05, 0.1, TAILLIGHT),
    box(-0.51, 0.28, -0.17, 0.03, 0.05, 0.1, TAILLIGHT),
    ...wheelAt(-0.3, 0.27),
    ...wheelAt(0.3, 0.27),
    ...wheelAt(-0.3, -0.27),
    ...wheelAt(0.3, -0.27),
  ]);
}

export function bicycle(): BufferGeometry {
  // Two thin wheels, a frame of three bars, a seat and handlebars. Length along x.
  const bar = (x: number, y: number, len: number, tilt: number): BufferGeometry =>
    colored(new BoxGeometry(len, 0.02, 0.02).rotateZ(tilt).translate(x, y, 0), METAL);
  return fitUnit([
    wheel(-0.32, 0.17, 0, 0.17, 0.03),
    wheel(0.32, 0.17, 0, 0.17, 0.03),
    bar(0, 0.28, 0.6, 0.12),
    bar(-0.12, 0.3, 0.4, -1.0),
    bar(0.2, 0.3, 0.4, 1.2),
    box(-0.2, 0.46, 0, 0.1, 0.03, 0.05, TIRE),
    box(0.34, 0.46, 0, 0.03, 0.03, 0.22, TIRE),
  ]);
}

export function airplane(): BufferGeometry {
  // Fuselage along x, wings along z, two engines, tail fin, tailplane and a row of cabin windows.
  const fuselage = new CylinderGeometry(0.08, 0.06, 1, 10).rotateZ(Math.PI / 2).translate(0, 0.2, 0);
  const engine = (z: number): BufferGeometry =>
    colored(new CylinderGeometry(0.035, 0.03, 0.16, 8).rotateZ(Math.PI / 2).translate(0.12, 0.15, z), METAL);
  return fitUnit([
    colored(fuselage, BODY),
    colored(new ConeGeometry(0.08, 0.2, 10).rotateZ(-Math.PI / 2).translate(0.6, 0.2, 0), METAL),
    box(0.05, 0.19, 0, 0.3, 0.02, 1, METAL),
    engine(0.28),
    engine(-0.28),
    box(-0.45, 0.2, 0, 0.14, 0.02, 0.36, METAL),
    box(-0.46, 0.3, 0, 0.14, 0.2, 0.02, GLASS),
    box(0.3, 0.24, 0.07, 0.35, 0.025, 0.012, GLASS),
    box(0.3, 0.24, -0.07, 0.35, 0.025, 0.012, GLASS),
  ]);
}
