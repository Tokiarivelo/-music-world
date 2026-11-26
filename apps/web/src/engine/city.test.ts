import { describe, expect, it } from 'vitest';
import { beatPosition, buildCity, cityFront, inLake, rankedSpot, SIGNAL_CYCLE, signalColor } from './city';
import { buildRoads, nearestRoad, ROAD_HALF_WIDTH } from './roads';

describe('city plan', () => {
  const city = buildCity(7, 14);

  it('is deterministic and covers the whole plate', () => {
    expect(buildCity(7, 14)).toBe(city);
    expect(city.lots.length).toBeGreaterThan(30);
    expect(city.gardens.length).toBeGreaterThan(30);
    const xs = city.lots.map((l) => l.x);
    expect(Math.min(...xs)).toBeLessThan(-city.half * 0.6);
    expect(Math.max(...xs)).toBeGreaterThan(city.half * 0.6);
    expect(new Set(city.lots.map((l) => l.variant)).size).toBeGreaterThanOrEqual(4);
  });

  it('keeps lots off the boulevards and out of the lakes', () => {
    const roads = buildRoads(7, 14);
    for (const lot of city.lots) {
      expect(nearestRoad(roads, lot.x, lot.z).dist).toBeGreaterThan(ROAD_HALF_WIDTH);
      expect(inLake(city, lot.x, lot.z)).toBe(false);
    }
  });

  it('has lakes with bridges, and traffic lights', () => {
    expect(city.lakes.length).toBeGreaterThan(0);
    expect(city.bridges.length).toBeGreaterThan(0);
    expect(city.lights.length).toBeGreaterThan(20);
  });

  it('ranks lots from the centre outwards and spreads items over the ranking', () => {
    const first = Math.hypot(city.lots[0]!.x, city.lots[0]!.z);
    const last = Math.hypot(city.lots.at(-1)!.x, city.lots.at(-1)!.z);
    expect(first).toBeLessThan(last);
    expect(rankedSpot(city.lots, 0, 10)).toBe(city.lots[Math.floor((0.5 * city.lots.length) / 10)]);
    expect(rankedSpot(city.lots, city.lots.length + 3, city.lots.length * 2)).toBe(city.lots[3]);
  });

  it('reveals the town progressively', () => {
    expect(cityFront(city, 0, 100)).toBeLessThan(cityFront(city, 50, 100));
    expect(cityFront(city, 100, 100)).toBeGreaterThanOrEqual(city.maxRadius);
  });

  it('runs the lights like a real crossing: green, yellow, red, never green for both streets', () => {
    const seen = new Set<number>();
    let order = '';
    for (let t = 0; t < SIGNAL_CYCLE; t += 0.25) {
      const a = signalColor(0, t, 0);
      const b = signalColor(1, t, 0);
      expect(a === 2 && b === 2).toBe(false);
      expect(a !== 0 && b !== 0).toBe(false); // while one street may go, the other is red
      seen.add(a);
      if (order.at(-1) !== String(a)) order += a;
    }
    expect(seen).toEqual(new Set([0, 1, 2]));
    expect(order.replace(/^(.*?)$/, '$1')).toMatch(/2.*1.*0/); // green, then yellow, then red
    expect(signalColor(0, 1, 3)).toBe(signalColor(0, 1 + SIGNAL_CYCLE, 3));
    expect(beatPosition([0, 1, 2, 3], 1.5)).toBeCloseTo(1.5);
    expect(beatPosition([], 2)).toBe(4);
  });
});
