/**
 * Road mesh (I38): asphalt with edge lines and a dashed centre line, concrete bridges with parapets and pillars, tunnel
 * portals where a road sinks below the plate. One merged BufferGeometry with vertex colors (one draw call), built from
 * the same `RoadNetwork` the traffic drives on, so cars always sit on the drawn road.
 */
import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { BRIDGE_HEIGHT, ROAD_HALF_WIDTH, levelAt, roadPoint, type Road, type RoadNetwork } from '@/engine/roads';

const STEP = 0.18; // metres between stations along a road
const LIFT = 0.012; // asphalt above the plate, against z-fighting
const DECK = 0.09; // thickness of a bridge deck
const PARAPET = 0.1;
const UNDERGROUND = -0.05; // below this a road is inside the ground: nothing is drawn
const ASPHALT = new Color('#3b3d46');
const EDGE_LINE = new Color('#d9d9cf');
const CENTRE_LINE = new Color('#e7c64a');
const CONCRETE = new Color('#9a9da6');
const CONCRETE_DARK = new Color('#5f626b');

class Mesh3 {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  quad(a: number[], b: number[], c: number[], d: number[], color: Color): void {
    const base = this.positions.length / 3;
    for (const p of [a, b, c, d]) {
      this.positions.push(p[0]!, p[1]!, p[2]!);
      this.colors.push(color.r, color.g, color.b);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A box centred on `c`, its length along the tangent `(tx, tz)`. */
  box(c: number[], tx: number, tz: number, hl: number, hh: number, hw: number, color: Color): void {
    const px = (l: number, h: number, w: number): number[] => [c[0]! + tx * l - tz * w, c[1]! + h, c[2]! + tz * l + tx * w];
    const corner = (i: number): number[] => px(i & 1 ? hl : -hl, i & 2 ? hh : -hh, i & 4 ? hw : -hw);
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (const f of faces) this.quad(corner(f[0]!), corner(f[1]!), corner(f[2]!), corner(f[3]!), color);
  }
}

interface Station {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  level: number;
}

function stationsOf(road: Road): Station[] {
  const n = Math.max(8, Math.round(road.length / STEP));
  return Array.from({ length: n }, (_, i) => {
    const s = (i / n) * road.length;
    const p = roadPoint(road, s);
    return { x: p.x, y: p.y, z: p.z, nx: -p.tz, nz: p.tx, level: p.y };
  });
}

function edge(st: Station, w: number, up: number): number[] {
  return [st.x + st.nx * w, Math.max(st.level, 0) + up, st.z + st.nz * w];
}

function addRoad(mesh: Mesh3, road: Road): void {
  const st = stationsOf(road);
  const W = ROAD_HALF_WIDTH;
  for (let i = 0; i < st.length; i += 1) {
    const a = st[i]!;
    const b = st[(i + 1) % st.length]!;
    if (a.level < UNDERGROUND || b.level < UNDERGROUND) continue; // inside a tunnel
    mesh.quad(edge(a, W, LIFT), edge(a, -W, LIFT), edge(b, -W, LIFT), edge(b, W, LIFT), ASPHALT);
    for (const side of [1, -1]) {
      const w0 = (W - 0.07) * side;
      const w1 = (W - 0.03) * side;
      mesh.quad(edge(a, w0, LIFT + 0.003), edge(a, w1, LIFT + 0.003), edge(b, w1, LIFT + 0.003), edge(b, w0, LIFT + 0.003), EDGE_LINE);
    }
    if (Math.floor(i / 4) % 2 === 0) mesh.quad(edge(a, 0.018, LIFT + 0.003), edge(a, -0.018, LIFT + 0.003), edge(b, -0.018, LIFT + 0.003), edge(b, 0.018, LIFT + 0.003), CENTRE_LINE);
    if (a.level > 0.04 && b.level > 0.04) {
      for (const side of [1, -1]) {
        const wall = (up0: number, up1: number): void =>
          mesh.quad(edge(a, W * side, up0), edge(a, W * side, up1), edge(b, W * side, up1), edge(b, W * side, up0), CONCRETE);
        wall(LIFT - DECK, LIFT); // the edge of the deck
        wall(LIFT, LIFT + PARAPET); // parapet
      }
      mesh.quad(edge(a, -W, LIFT - DECK), edge(a, W, LIFT - DECK), edge(b, W, LIFT - DECK), edge(b, -W, LIFT - DECK), CONCRETE_DARK);
    }
  }
  for (const bump of road.bumps) {
    const edgeS = bump.plateau;
    for (const sign of [-1, 1]) {
      const s = bump.s + sign * edgeS;
      const p = roadPoint(road, s);
      if (bump.height > 0) {
        for (const side of [1, -1]) {
          const h = BRIDGE_HEIGHT - DECK / 2;
          mesh.box([p.x - p.tz * (ROAD_HALF_WIDTH - 0.1) * side, h / 2, p.z + p.tx * (ROAD_HALF_WIDTH - 0.1) * side], p.tx, p.tz, 0.07, h / 2, 0.07, CONCRETE);
        }
      } else {
        // Tunnel portal where the road reaches the ground on the way down: two posts and a lintel.
        let sp = s;
        for (let k = 0; k < 40; k += 1) {
          const probe = bump.s + sign * (edgeS + (k / 40) * bump.ramp);
          if (levelAt(road, probe) > -0.02) {
            sp = probe;
            break;
          }
          sp = probe;
        }
        const q = roadPoint(road, sp);
        const hw = ROAD_HALF_WIDTH + 0.12;
        for (const side of [1, -1]) mesh.box([q.x - q.tz * hw * side, 0.3, q.z + q.tx * hw * side], q.tx, q.tz, 0.1, 0.3, 0.07, CONCRETE);
        mesh.box([q.x, 0.62, q.z], q.tx, q.tz, 0.1, 0.07, hw + 0.07, CONCRETE_DARK);
      }
    }
  }
}

export function buildRoadGeometry(network: RoadNetwork): BufferGeometry {
  const mesh = new Mesh3();
  for (const road of network.roads) addRoad(mesh, road);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(mesh.colors, 3));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingSphere();
  return geometry;
}
