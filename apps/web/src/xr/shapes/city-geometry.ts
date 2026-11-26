/**
 * Ground of the city (I39): sidewalks and yards of every block, parks, the street grid with dashed centre lines and
 * zebra crossings, lake shores, and bridges where a street crosses a lake. One merged BufferGeometry with vertex colors
 * (one draw call); the lake water is a second geometry so it can shimmer. Built from the same `City` the placement
 * uses, so every house stands on its lot and no street crosses a house.
 */
import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { inLake, SIDEWALK, STREET_HALF, type City, type Lake } from '@/engine/city';

const Y_BLOCK = 0.004;
const Y_YARD = 0.006;
const Y_STREET = 0.009;
const Y_MARK = 0.0115;
const Y_WATER = 0.007;
const DECK_Y = 0.05;
const PARAPET = 0.05;
const SIDEWALK_COLOR = new Color('#a9a79f');
const YARD_COLOR = new Color('#7f9a63');
const PARK_COLOR = new Color('#4f9d3f');
const ASPHALT = new Color('#43454e');
const DASH = new Color('#e8e4d0');
const ZEBRA = new Color('#ecebe4');
const SAND = new Color('#d9c48e');
const CONCRETE = new Color('#b4b6bd');
const CONCRETE_DARK = new Color('#6c6f78');
const WATER_SHORE = new Color('#5fc7d6');
const WATER_DEEP = new Color('#1f6fa8');

/** Colors of the ground follow the template: darker and tinted toward its terrain color in a night palette. */
export interface CityTone {
  readonly gain: number;
  readonly tint: Color;
  readonly tintAmount: number;
}

export const DAY_TONE: CityTone = { gain: 1, tint: new Color('#ffffff'), tintAmount: 0 };

class Builder {
  readonly positions: number[] = [];
  private readonly scratch = new Color();

  constructor(private readonly tone: CityTone) {}

  readonly colors: number[] = [];
  readonly indices: number[] = [];

  vertex(x: number, y: number, z: number, c: Color): number {
    const t = this.scratch.copy(c).multiplyScalar(this.tone.gain).lerp(this.tone.tint, this.tone.tintAmount);
    this.positions.push(x, y, z);
    this.colors.push(t.r, t.g, t.b);
    return this.positions.length / 3 - 1;
  }

  /** Horizontal rectangle, facing up. */
  rect(x0: number, z0: number, x1: number, z1: number, y: number, c: Color): void {
    const a = this.vertex(x0, y, z0, c);
    const b = this.vertex(x0, y, z1, c);
    const d = this.vertex(x1, y, z1, c);
    const e = this.vertex(x1, y, z0, c);
    this.indices.push(a, b, d, a, d, e);
  }

  /** Vertical wall between two ground points, from `y0` to `y1`, double sided by construction. */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, c: Color): void {
    const a = this.vertex(x0, y0, z0, c);
    const b = this.vertex(x1, y0, z1, c);
    const d = this.vertex(x1, y1, z1, c);
    const e = this.vertex(x0, y1, z0, c);
    this.indices.push(a, b, d, a, d, e, a, d, b, a, e, d);
  }

  box(cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, c: Color): void {
    this.rect(cx - hx, cz - hz, cx + hx, cz + hz, y1, c);
    this.wall(cx - hx, cz - hz, cx + hx, cz - hz, y0, y1, c);
    this.wall(cx - hx, cz + hz, cx + hx, cz + hz, y0, y1, c);
    this.wall(cx - hx, cz - hz, cx - hx, cz + hz, y0, y1, c);
    this.wall(cx + hx, cz - hz, cx + hx, cz + hz, y0, y1, c);
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** The parts of the line `[-half, half]` that are not inside a bridge. */
function dryParts(city: City, axis: 'x' | 'z', at: number): [number, number][] {
  const bridges = city.bridges.filter((b) => b.axis === axis && b.at === at).sort((p, q) => p.from - q.from);
  const parts: [number, number][] = [];
  let cursor = -city.half;
  for (const b of bridges) {
    if (b.from > cursor) parts.push([cursor, b.from]);
    cursor = Math.max(cursor, b.to);
  }
  if (cursor < city.half) parts.push([cursor, city.half]);
  return parts;
}

function along(axis: 'x' | 'z', at: number, u0: number, u1: number, w: number): [number, number, number, number] {
  return axis === 'x' ? [u0, at - w, u1, at + w] : [at - w, u0, at + w, u1];
}

export function buildCityGeometry(city: City, tone: CityTone = DAY_TONE): BufferGeometry {
  const b = new Builder(tone);
  for (const block of city.blocks) {
    const x0 = block.x0 + STREET_HALF;
    const x1 = block.x1 - STREET_HALF;
    const z0 = block.z0 + STREET_HALF;
    const z1 = block.z1 - STREET_HALF;
    b.rect(x0, z0, x1, z1, Y_BLOCK, SIDEWALK_COLOR);
    b.rect(x0 + SIDEWALK, z0 + SIDEWALK, x1 - SIDEWALK, z1 - SIDEWALK, Y_YARD, block.park ? PARK_COLOR : YARD_COLOR);
  }
  for (const street of city.streets) {
    for (const [u0, u1] of dryParts(city, street.axis, street.at)) {
      const [ax, az, bx, bz] = along(street.axis, street.at, u0, u1, STREET_HALF);
      b.rect(ax, az, bx, bz, Y_STREET, ASPHALT);
      for (let u = u0 + 0.1; u < u1 - 0.2; u += 0.3) {
        const [dx0, dz0, dx1, dz1] = along(street.axis, street.at, u, u + 0.14, 0.008);
        b.rect(dx0, dz0, dx1, dz1, Y_MARK, DASH);
      }
    }
  }
  // Zebra crossings on the four arms of every crossing that is on dry land.
  const lines = [...new Set(city.streets.map((s) => s.at))];
  for (const sx of lines) {
    for (const sz of lines) {
      if (inLake(city, sx, sz, 0.35)) continue;
      const reach = STREET_HALF + 0.1;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (let k = -2; k <= 2; k += 1) {
          const cx = sx + dx * reach + (dz !== 0 ? k * 0.055 : 0);
          const cz = sz + dz * reach + (dx !== 0 ? k * 0.055 : 0);
          b.rect(cx - (dx !== 0 ? 0.035 : 0.018), cz - (dz !== 0 ? 0.035 : 0.018), cx + (dx !== 0 ? 0.035 : 0.018), cz + (dz !== 0 ? 0.035 : 0.018), Y_MARK, ZEBRA);
        }
      }
    }
  }
  for (const lake of city.lakes) shore(b, lake);
  for (const bridge of city.bridges) {
    const [ax, az, bx, bz] = along(bridge.axis, bridge.at, bridge.from, bridge.to, STREET_HALF + 0.02);
    b.rect(ax, az, bx, bz, DECK_Y, ASPHALT);
    for (let u = bridge.from + 0.08; u < bridge.to - 0.16; u += 0.3) {
      const [dx0, dz0, dx1, dz1] = along(bridge.axis, bridge.at, u, u + 0.14, 0.008);
      b.rect(dx0, dz0, dx1, dz1, DECK_Y + 0.002, DASH);
    }
    for (const side of [-1, 1]) {
      const off = side * (STREET_HALF + 0.02);
      const [p0x, p0z] = bridge.axis === 'x' ? [bridge.from, bridge.at + off] : [bridge.at + off, bridge.from];
      const [p1x, p1z] = bridge.axis === 'x' ? [bridge.to, bridge.at + off] : [bridge.at + off, bridge.to];
      b.wall(p0x, p0z, p1x, p1z, 0, DECK_Y, CONCRETE_DARK);
      b.wall(p0x, p0z, p1x, p1z, DECK_Y, DECK_Y + PARAPET, CONCRETE);
    }
    for (let u = bridge.from + 0.25; u < bridge.to - 0.2; u += 0.55) {
      for (const side of [-1, 1]) {
        const off = side * (STREET_HALF - 0.04);
        b.box(bridge.axis === 'x' ? u : bridge.at + off, bridge.axis === 'x' ? bridge.at + off : u, 0.03, 0.03, 0, DECK_Y, CONCRETE_DARK);
      }
    }
  }
  return b.geometry();
}

const LAKE_SEGMENTS = 40;

function lakePoint(lake: Lake, a: number, scale: number): [number, number] {
  const c = Math.cos(lake.rot);
  const s = Math.sin(lake.rot);
  const lx = Math.cos(a) * (lake.rx * scale);
  const lz = Math.sin(a) * (lake.rz * scale);
  return [lake.cx + lx * c - lz * s, lake.cz + lx * s + lz * c];
}

/** A band of sand round the water. */
function shore(b: Builder, lake: Lake): void {
  for (let i = 0; i < LAKE_SEGMENTS; i += 1) {
    const a0 = (i / LAKE_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / LAKE_SEGMENTS) * Math.PI * 2;
    const [ix0, iz0] = lakePoint(lake, a0, 0.97);
    const [ix1, iz1] = lakePoint(lake, a1, 0.97);
    const [ox0, oz0] = lakePoint(lake, a0, 1.16);
    const [ox1, oz1] = lakePoint(lake, a1, 1.16);
    const v0 = b.vertex(ix0, Y_YARD + 0.001, iz0, SAND);
    const v1 = b.vertex(ix1, Y_YARD + 0.001, iz1, SAND);
    const v2 = b.vertex(ox1, Y_YARD + 0.001, oz1, SAND);
    const v3 = b.vertex(ox0, Y_YARD + 0.001, oz0, SAND);
    b.indices.push(v0, v1, v2, v0, v2, v3, v0, v2, v1, v0, v3, v2);
  }
}

/** Water of all lakes: a fan per lake, deep blue in the middle and turquoise at the shore. */
export function buildWaterGeometry(city: City, tone: CityTone = DAY_TONE): BufferGeometry {
  const b = new Builder(tone);
  for (const lake of city.lakes) {
    const centre = b.vertex(lake.cx, Y_WATER, lake.cz, WATER_DEEP);
    const ring: number[] = [];
    const mid: number[] = [];
    for (let i = 0; i < LAKE_SEGMENTS; i += 1) {
      const a = (i / LAKE_SEGMENTS) * Math.PI * 2;
      const [mx, mz] = lakePoint(lake, a, 0.6);
      const [x, z] = lakePoint(lake, a, 1);
      mid.push(b.vertex(mx, Y_WATER, mz, WATER_DEEP.clone().lerp(WATER_SHORE, 0.45)));
      ring.push(b.vertex(x, Y_WATER, z, WATER_SHORE));
    }
    for (let i = 0; i < LAKE_SEGMENTS; i += 1) {
      const n = (i + 1) % LAKE_SEGMENTS;
      b.indices.push(centre, mid[n]!, mid[i]!, mid[i]!, mid[n]!, ring[n]!, mid[i]!, ring[n]!, ring[i]!);
    }
  }
  return b.geometry();
}
