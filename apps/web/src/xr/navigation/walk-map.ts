/**
 * What the walk map draws besides the walker and the structures: streets, roads and lakes of the plan, in world
 * metres. Pure; the host computes it once per plan.
 */
import { cityOf, templateHasCity, worldSize } from "@/engine/city";
import { buildRoads, templateHasRoads } from "@/engine/roads";
import type { SpawnPlan } from "@/engine/spawn-plan";

export interface MapSegment {
  /** x0, z0, x1, z1 */
  readonly line: readonly [number, number, number, number];
  readonly width: number;
}

export interface MapLake {
  x: number;
  z: number;
  rx: number;
  rz: number;
  rot: number;
}

export interface WalkMapFeatures {
  /** Street grid cells and road samples, as segments. */
  readonly segments: readonly MapSegment[];
  readonly lakes: readonly MapLake[];
}

export const NO_MAP_FEATURES: WalkMapFeatures = { segments: [], lakes: [] };

/** `scale`: plate units to world metres; `anchor`: world position of the plate centre. */
export function mapFeaturesOf(
  plan: SpawnPlan,
  scale: number,
  anchor: { x: number; z: number },
): WalkMapFeatures {
  const { template, seed } = plan;
  const segments: MapSegment[] = [];
  const lakes: MapLake[] = [];
  const at = (x: number, z: number): [number, number] => [
    anchor.x + x * scale,
    anchor.z + z * scale,
  ];
  if (templateHasCity(template)) {
    const city = cityOf(template, seed);
    for (const s of city.streets) {
      const [x0, z0] =
        s.axis === "x" ? at(-city.half, s.at) : at(s.at, -city.half);
      const [x1, z1] =
        s.axis === "x" ? at(city.half, s.at) : at(s.at, city.half);
      segments.push({ line: [x0, z0, x1, z1], width: 0.3 * scale });
    }
    for (const l of city.lakes) {
      const [x, z] = at(l.cx, l.cz);
      lakes.push({ x, z, rx: l.rx * scale, rz: l.rz * scale, rot: l.rot });
    }
  } else if (templateHasRoads(template)) {
    const net = buildRoads(seed, worldSize(template));
    for (const road of net.roads) {
      const step = 3;
      for (let i = 0; i + step < road.px.length; i += step) {
        const [x0, z0] = at(road.px[i]!, road.pz[i]!);
        const [x1, z1] = at(road.px[i + step]!, road.pz[i + step]!);
        segments.push({
          line: [x0, z0, x1, z1],
          width: (road.kind === "main" ? 0.9 : 0.4) * scale,
        });
      }
    }
  }
  return { segments, lakes };
}
