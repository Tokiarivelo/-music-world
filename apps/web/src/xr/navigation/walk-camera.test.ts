import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EYE_HEIGHT_M,
  IMMERSIVE_OBJECT_SCALE,
  WALK_LOOK_RAD_PER_PX,
  WALK_MARGIN_M,
  WALK_PITCH_LIMIT_RAD,
} from "../constants";
import type { FlyKeys } from "./orbit-camera";
import {
  WALKER_RADIUS_M,
  clampToBounds,
  look,
  obstaclesAt,
  pushOut,
  startPose,
  walk,
  walkCamera,
  type Circle,
} from "./walk-camera";

const bounds = { cx: 0, cz: -30, half: 40 };
const keys = (over: Partial<FlyKeys> = {}): FlyKeys => ({
  forward: 0,
  right: 0,
  turn: 0,
  zoom: 0,
  fast: false,
  ...over,
});

describe("walk camera", () => {
  it("starts inside the near edge looking toward the plate centre", () => {
    const p = startPose(bounds);
    expect(p.z).toBeGreaterThan(bounds.cz);
    const { eye, at } = walkCamera(p);
    expect(eye.y).toBe(EYE_HEIGHT_M);
    expect(at.z).toBeLessThan(eye.z); // yaw 0 looks toward −z
  });

  it("walks forward and strafes relative to the view", () => {
    const p = { x: 0, z: 0, yaw: 0, pitch: 0 };
    expect(walk(p, keys({ forward: 1 }), 0.1, bounds, []).z).toBeLessThan(0);
    expect(walk(p, keys({ right: 1 }), 0.1, bounds, []).x).toBeGreaterThan(0);
    const turned = { ...p, yaw: Math.PI / 2 }; // facing −x
    expect(walk(turned, keys({ forward: 1 }), 0.1, bounds, []).x).toBeLessThan(
      0,
    );
  });

  it("cannot enter a structure and slides around it", () => {
    const wall: Circle[] = [{ x: 0, z: -2, r: 1 }];
    let p = { x: 0, z: 0, yaw: 0, pitch: 0 };
    for (let i = 0; i < 100; i += 1)
      p = walk(p, keys({ forward: 1 }), 0.1, bounds, wall);
    expect(Math.hypot(p.x, p.z + 2)).toBeGreaterThanOrEqual(
      1 + WALKER_RADIUS_M - 1e-6,
    );
  });

  it("stays on the plate plus the margin, never closed at the plate edge", () => {
    let p = { x: 0, z: 0, yaw: Math.PI / 2, pitch: 0 }; // walk toward −x
    for (let i = 0; i < 2000; i += 1)
      p = walk(p, keys({ forward: 1, fast: true }), 0.1, bounds, []);
    expect(p.x).toBeCloseTo(-(bounds.half + WALK_MARGIN_M));
    expect(p.x).toBeLessThan(-bounds.half); // the walker goes past the plate
  });

  it("limits the pitch of the look", () => {
    const up = look({ x: 0, z: 0, yaw: 0, pitch: 0 }, 0, -1e6).pitch;
    const down = look({ x: 0, z: 0, yaw: 0, pitch: 0 }, 0, 1e6).pitch;
    expect(up).toBe(WALK_PITCH_LIMIT_RAD);
    expect(down).toBe(-WALK_PITCH_LIMIT_RAD);
    expect(up).toBeGreaterThan(1.4); // the sky overhead is almost reachable (about 86°)
    expect(up).toBeLessThan(Math.PI / 2); // never straight up: lookAt would lose its up axis
  });

  it("looks all the way round: 360° of mouse travel come back to the start", () => {
    let pose = { x: 0, z: 0, yaw: 0, pitch: 0 };
    const px = (2 * Math.PI) / WALK_LOOK_RAD_PER_PX;
    for (let i = 0; i < 10; i += 1) pose = look(pose, px / 10, 0);
    expect(Math.abs(pose.yaw)).toBeCloseTo(2 * Math.PI, 6);
  });

  it("E turns to the right and Q to the left, arrow keys tilt the head", () => {
    const at = { x: 0, z: 0, yaw: 0, pitch: 0 };
    expect(walk(at, keys({ turn: 1 }), 0.1, bounds, []).yaw).toBeLessThan(0); // negative yaw = toward +x = right
    expect(walk(at, keys({ turn: -1 }), 0.1, bounds, []).yaw).toBeGreaterThan(
      0,
    );
    expect(walk(at, keys({ tilt: 1 }), 0.1, bounds, []).pitch).toBeGreaterThan(
      0,
    );
    expect(
      walk(at, keys({ tilt: -1 }), 10, bounds, []).pitch,
    ).toBeGreaterThanOrEqual(-WALK_PITCH_LIMIT_RAD);
  });

  it("keeps the head turned by the mouse while walking forward", () => {
    const turned = look({ x: 0, z: 0, yaw: 0, pitch: 0 }, 200, -100);
    const moved = walk(turned, keys({ forward: 1 }), 0.1, bounds, []);
    expect(moved.yaw).toBe(turned.yaw);
    expect(moved.pitch).toBe(turned.pitch);
  });

  it("never leaves bounds nor enters an obstacle, whatever the input", () => {
    const circles: Circle[] = [
      { x: 3, z: -28, r: 2 },
      { x: -10, z: -20, r: 1.5 },
    ];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            f: fc.integer({ min: -1, max: 1 }),
            r: fc.integer({ min: -1, max: 1 }),
            t: fc.integer({ min: -1, max: 1 }),
          }),
          { maxLength: 200 },
        ),
        (steps) => {
          let p = startPose(bounds);
          for (const s of steps)
            p = walk(
              p,
              keys({ forward: s.f, right: s.r, turn: s.t }),
              0.05,
              bounds,
              circles,
            );
          const limit = bounds.half + WALK_MARGIN_M;
          expect(Math.abs(p.x - bounds.cx)).toBeLessThanOrEqual(limit + 1e-9);
          expect(Math.abs(p.z - bounds.cz)).toBeLessThanOrEqual(limit + 1e-9);
          for (const c of circles) {
            const inside =
              Math.hypot(p.x - c.x, p.z - c.z) < c.r + WALKER_RADIUS_M - 1e-3;
            const pushedOnEdge = pushOut(p.x, p.z, WALKER_RADIUS_M, circles);
            expect(
              inside && (pushedOnEdge.x !== p.x || pushedOnEdge.z !== p.z),
            ).toBe(false);
          }
        },
      ),
    );
  });

  it("falls back to the plate centre for a non-finite position", () => {
    expect(clampToBounds(NaN, Infinity, bounds)).toEqual({
      x: bounds.cx,
      z: bounds.cz,
    });
  });

  it("builds collision circles only from structures that have landed", () => {
    const plan = {
      template: { recipes: [{ name: "fish", footprint: 0.5 }] },
      records: [
        { kind: "building", landAt: 1, target: { x: 1, y: 0, z: 2 } },
        { kind: "recipe:fish", landAt: 9, target: { x: 0, y: 0, z: 0 } },
      ],
    } as never;
    const early = obstaclesAt(plan, 2, 10, { x: 0, z: -30 });
    expect(early).toHaveLength(1);
    expect(early[0]).toMatchObject({ x: 10, z: -10 });
    expect(early[0]!.r).toBeCloseTo((0.24 / 2) * 10 * IMMERSIVE_OBJECT_SCALE); // objects keep their calibrated size on the wide plate
    expect(obstaclesAt(plan, 10, 10, { x: 0, z: -30 })).toHaveLength(2);
  });
});
