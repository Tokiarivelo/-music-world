/**
 * Building variants of the city (I39): tower, house, apartment block, shop and skyscraper. Same conventions as the
 * other builtin shapes: unit footprint on x/z, base at y = 0, height 1 (instances scale them). Roofs have an upward
 * normal, so the building material colors them as roofs; windows come from the shader. Non-indexed, flat shaded.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';

type V = readonly [number, number, number];

class Soup {
  readonly positions: number[] = [];

  tri(a: V, b: V, c: V): void {
    this.positions.push(...a, ...b, ...c);
  }

  quad(a: V, b: V, c: V, d: V): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Axis-aligned box from `(x0, y0, z0)` to `(x1, y1, z1)`. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // front +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // back
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // -x
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // top
    return this;
  }

  /** Gabled roof: ridge along x at height `top`, eaves at `eave`, from `z0` to `z1`. */
  gable(x0: number, x1: number, z0: number, z1: number, eave: number, top: number): this {
    const zm = (z0 + z1) / 2;
    this.quad([x0, eave, z1], [x1, eave, z1], [x1, top, zm], [x0, top, zm]); // front slope
    this.quad([x1, eave, z0], [x0, eave, z0], [x0, top, zm], [x1, top, zm]); // back slope
    this.tri([x1, eave, z1], [x1, eave, z0], [x1, top, zm]); // gable ends
    this.tri([x0, eave, z0], [x0, eave, z1], [x0, top, zm]);
    return this;
  }

  /** Slanted slab (an awning): from the wall at height `yHigh` down to `yLow` at `z` further out. */
  awning(x0: number, x1: number, zWall: number, zOut: number, yHigh: number, yLow: number): this {
    this.quad([x0, yHigh, zWall], [x1, yHigh, zWall], [x1, yLow, zOut], [x0, yLow, zOut]);
    this.quad([x0, yLow, zOut], [x1, yLow, zOut], [x1, yHigh - 0.01, zWall], [x0, yHigh - 0.01, zWall]);
    return this;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.computeVertexNormals(); // non-indexed: one normal per face
    return geometry;
  }
}

/** Tower: a body with a narrower set-back top (the original lit city block). */
function tower(): BufferGeometry {
  return new Soup().box(-0.5, 0, -0.5, 0.5, 0.8, 0.5).box(-0.3, 0.8, -0.3, 0.3, 1, 0.3).build();
}

/** House: walls under a gabled roof, a chimney and a porch step. */
function house(): BufferGeometry {
  return new Soup()
    .box(-0.5, 0, -0.38, 0.5, 0.52, 0.38)
    .gable(-0.56, 0.56, -0.5, 0.5, 0.52, 0.92)
    .box(0.2, 0.7, -0.2, 0.34, 1, -0.06) // chimney
    .box(-0.15, 0, 0.38, 0.15, 0.06, 0.5) // porch step
    .build();
}

/** Apartment block: a mid-rise slab, a parapet round the flat roof and a stair head. */
function apartment(): BufferGeometry {
  return new Soup()
    .box(-0.5, 0, -0.5, 0.5, 0.9, 0.5)
    .box(-0.54, 0.9, -0.54, 0.54, 0.96, 0.54)
    .box(-0.18, 0.96, -0.18, 0.18, 1, 0.18)
    .build();
}

/** Shop: low and wide, an awning over the street side and a sign on the roof. */
function shop(): BufferGeometry {
  return new Soup()
    .box(-0.5, 0, -0.5, 0.5, 0.78, 0.46)
    .awning(-0.46, 0.46, 0.46, 0.7, 0.42, 0.3)
    .box(-0.3, 0.78, -0.05, 0.3, 1, 0.05) // sign
    .build();
}

/** Skyscraper: three set-backs and a mast. */
function skyscraper(): BufferGeometry {
  return new Soup()
    .box(-0.5, 0, -0.5, 0.5, 0.55, 0.5)
    .box(-0.38, 0.55, -0.38, 0.38, 0.82, 0.38)
    .box(-0.24, 0.82, -0.24, 0.24, 0.94, 0.24)
    .box(-0.03, 0.94, -0.03, 0.03, 1, 0.03)
    .build();
}

/** Geometry of each building variant, in the order of `BUILDING_VARIANTS` (`engine/city.ts`). */
export function buildingVariantGeometries(): BufferGeometry[] {
  return [tower(), house(), apartment(), shop(), skyscraper()];
}

/**
 * Scaffolding of a building under construction: four poles, floor rails and a few diagonal braces (unit box); the
 * instance is scaled to the building and rises with it.
 */
export function scaffoldGeometry(): BufferGeometry {
  const t = 0.018;
  const s = new Soup();
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) s.box(x - t, 0, z - t, x + t, 1, z + t);
  for (let k = 1; k <= 8; k += 1) {
    const y = k / 8;
    const h = 0.004;
    s.box(-0.5, y - h, -0.5 - t, 0.5, y + h, -0.5 + t).box(-0.5, y - h, 0.5 - t, 0.5, y + h, 0.5 + t);
    s.box(-0.5 - t, y - h, -0.5, -0.5 + t, y + h, 0.5).box(0.5 - t, y - h, -0.5, 0.5 + t, y + h, 0.5);
  }
  return s.build();
}

/** Tower crane (unit height): mast, jib with counterweight and a hanging hook line, jib along +x from the mast. */
export function craneGeometry(): BufferGeometry {
  const s = new Soup();
  s.box(-0.02, 0, -0.02, 0.02, 1, 0.02); // mast
  s.box(-0.35, 0.96, -0.012, 1.1, 0.985, 0.012); // jib
  s.box(-0.35, 0.93, -0.03, -0.18, 0.96, 0.03); // counterweight
  s.box(0.78, 0.8, -0.004, 0.79, 0.96, 0.004); // hook line
  s.box(0.765, 0.78, -0.016, 0.805, 0.8, 0.016); // hook block
  s.box(-0.015, 0.985, -0.015, 0.015, 1.04, 0.015); // tip
  return s.build();
}
