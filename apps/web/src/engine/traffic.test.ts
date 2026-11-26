import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from './__fixtures__/demo-analysis';
import { cityOf, inLake, signalColor, signalPhase, SIGNAL_CYCLE, STREET_HALF } from './city';
import { buildSpawnPlan } from './spawn-plan';
import { streetTrafficOf } from './traffic';
import { DEFAULT_TEMPLATE } from '@/templates/default';

const plan = buildSpawnPlan(demo, DEFAULT_TEMPLATE, 3);
const traffic = streetTrafficOf(plan);
const city = cityOf(plan.template, plan.seed);
const lines = [...new Set(city.streets.map((s) => s.at))];
const onStreet = (x: number, z: number): boolean => {
  const near = (v: number) => lines.some((l) => Math.abs(v - l) < STREET_HALF + 0.001);
  return near(x) || near(z);
};
const poses = (t: number) => {
  const out: { kind: 'car' | 'bicycle'; slot: number; x: number; z: number; yaw: number }[] = [];
  for (const kind of ['car', 'bicycle'] as const) {
    for (let slot = 0; slot < traffic.caps[kind]; slot += 1) {
      const p = traffic.poseAt(kind, slot, t);
      if (p) out.push({ kind, slot, x: p.x, z: p.z, yaw: p.yaw });
    }
  }
  return out;
};

describe('street traffic (I41)', () => {
  it('keeps every vehicle on a street of the grid, at any time', () => {
    for (let t = 0; t <= plan.durationSec; t += 3.7) {
      for (const p of poses(t)) expect(onStreet(p.x, p.z), `${p.kind} ${p.slot} at ${t}`).toBe(true);
    }
  });

  it('is a pure function of time: a seek gives the same poses as playing', () => {
    const a = poses(20.3);
    poses(50);
    expect(poses(20.3)).toEqual(a);
  });

  it('keeps vehicles apart and moves them smoothly', () => {
    let last = new Map<string, { x: number; z: number }>();
    for (let t = 30; t < 90; t += 0.5) {
      const now = poses(t);
      for (const [i, a] of now.entries()) {
        for (const b of now.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.kind}${a.slot}/${b.kind}${b.slot} at ${t}`).toBeGreaterThan(0.06);
        const before = last.get(`${a.kind}${a.slot}`);
        if (before) expect(Math.hypot(a.x - before.x, a.z - before.z)).toBeLessThan(0.62 * 0.5 * 1.2 + 1e-6); // never faster than its cruising speed
      }
      last = new Map(now.map((p) => [`${p.kind}${p.slot}`, p]));
    }
  });

  it('obeys the lights: nobody crosses a crossing on red, and some vehicles do stop', () => {
    let stopped = 0;
    let crossedOnRed = 0;
    const prev = new Map<string, { x: number; z: number }>();
    for (let t = 20; t < 140; t += 0.1) {
      for (const p of poses(t)) {
        const key = `${p.kind}${p.slot}`;
        const before = prev.get(key);
        if (before) {
          if (Math.hypot(p.x - before.x, p.z - before.z) < 1e-4) stopped += 1;
          // entering the box of a crossing (all four sides within the street width) while the light of its street is red
          for (const sx of lines) {
            for (const sz of lines) {
              if (inLake(city, sx, sz, 0.35)) continue;
              const inside = (q: { x: number; z: number }): boolean => Math.abs(q.x - sx) < STREET_HALF && Math.abs(q.z - sz) < STREET_HALF;
              if (inside(p) && !inside(before)) {
                const axis = Math.abs(Math.cos(p.yaw)) > 0.7 ? 0 : 1; // moving along x or z (the turning arc is mostly inside)
                if (signalColor(axis, t - 0.1, signalPhase(sx, sz)) === 0 && signalColor(axis, t - 1.5, signalPhase(sx, sz)) === 0) crossedOnRed += 1;
              }
            }
          }
        }
        prev.set(key, p);
      }
    }
    expect(crossedOnRed).toBe(0);
    expect(stopped).toBeGreaterThan(20);
    expect(SIGNAL_CYCLE).toBeGreaterThan(10);
  });
});
