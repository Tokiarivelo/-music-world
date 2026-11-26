import { describe, expect, it } from 'vitest';
import { beatPosition, buildCity, cityFront, inLake, lightColor, rankedSpot } from './city';
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

  it('cycles traffic lights with opposite axes', () => {
    for (const beat of [0, 2, 3.7, 5, 7.8]) {
      expect([lightColor(0, beat), lightColor(1, beat)]).not.toEqual([2, 2]);
    }
    expect(beatPosition([0, 1, 2, 3], 1.5)).toBeCloseTo(1.5);
    expect(beatPosition([], 2)).toBe(4);
  });
});
