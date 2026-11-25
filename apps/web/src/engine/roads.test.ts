import { describe, expect, it } from 'vitest';
import { BRIDGE_HEIGHT, ROAD_HALF_WIDTH, buildRoads, clearOfRoads, levelAt, nearestRoad, roadPoint } from './roads';

describe('road network (I38)', () => {
  it('is a pure function of (seed, size)', () => {
    expect(buildRoads(3, 14).roads[0]!.length).toBe(buildRoads(3, 14).roads[0]!.length);
    expect(buildRoads(3, 14).roads[1]!.cx).not.toBe(buildRoads(4, 14).roads[1]!.cx);
  });

  it('has flyovers where the roads cross, and tunnels on most plates', () => {
    let withTunnel = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const heights = buildRoads(seed, 14).roads.flatMap((r) => r.bumps.map((b) => b.height));
      expect(heights.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      if (heights.some((h) => h < 0)) withTunnel += 1;
    }
    expect(withTunnel).toBeGreaterThanOrEqual(12);
  });

  it('keeps every road continuous and the slopes gentle', () => {
    const network = buildRoads(5, 14);
    for (const road of network.roads) {
      let prev = roadPoint(road, 0);
      for (let s = 0.1; s <= road.length; s += 0.1) {
        const p = roadPoint(road, s);
        expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.15);
        expect(Math.abs(p.y - prev.y)).toBeLessThan(0.08);
        expect(Math.abs(p.slope)).toBeLessThan(0.6);
        expect(Math.abs(levelAt(road, s))).toBeLessThanOrEqual(BRIDGE_HEIGHT + 1e-9);
        prev = p;
      }
    }
  });

  it('never lets two roads meet at the same level', () => {
    const { roads } = buildRoads(9, 14);
    for (let i = 0; i < roads.length; i += 1) {
      for (let j = i + 1; j < roads.length; j += 1) {
        for (let a = 0; a < roads[i]!.length; a += 0.05) {
          const p = roadPoint(roads[i]!, a);
          for (let b = 0; b < roads[j]!.length; b += 0.05) {
            const q = roadPoint(roads[j]!, b);
            if (Math.hypot(p.x - q.x, p.z - q.z) < ROAD_HALF_WIDTH * 1.5) expect(Math.abs(p.y - q.y)).toBeGreaterThan(0.3);
          }
        }
      }
    }
  });

  it('pushes fixed objects out of the road corridor', () => {
    const network = buildRoads(2, 14);
    const on = roadPoint(network.roads[0]!, 4);
    const moved = clearOfRoads(network, on.x, on.z, 0.3, 7);
    expect(nearestRoad(network, moved.x, moved.z).dist).toBeGreaterThanOrEqual(ROAD_HALF_WIDTH + 0.3 - 1e-6);
    const far = clearOfRoads(network, 6.5, 6.5, 0.3, 7);
    expect(far.x).toBeLessThanOrEqual(6.8);
  });
});
