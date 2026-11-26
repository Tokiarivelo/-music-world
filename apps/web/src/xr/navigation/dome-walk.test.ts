import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { WALK_MARGIN_M } from "../constants";
import {
  DOME_WALK_RATIO,
  clampToBounds,
  startPose,
  walk,
  type WalkBounds,
} from "./walk-camera";

const dome: WalkBounds = { cx: 2, cz: -5, half: 40, dome: true };
const KEYS = { forward: 1, right: 0, turn: 0, up: 0, fast: true } as never;

describe("dome walk", () => {
  it("starts at the centre of the dome", () => {
    const p = startPose(dome);
    expect([p.x, p.z]).toEqual([2, -5]);
  });

  it("never lets the walker leave the dome, whatever the point asked", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        (x, z) => {
          const p = clampToBounds(x, z, dome);
          expect(Math.hypot(p.x - dome.cx, p.z - dome.cz)).toBeLessThanOrEqual(
            dome.half * DOME_WALK_RATIO + 1e-6,
          );
        },
      ),
    );
  });

  it("stops at the wall when walking straight into it", () => {
    let pose = startPose(dome);
    for (let i = 0; i < 4000; i += 1) pose = walk(pose, KEYS, 0.05, dome, []);
    expect(Math.hypot(pose.x - dome.cx, pose.z - dome.cz)).toBeLessThanOrEqual(
      dome.half * DOME_WALK_RATIO + 1e-6,
    );
  });

  it("keeps the plate behaviour without the dome flag", () => {
    const plate: WalkBounds = { cx: 0, cz: 0, half: 40 };
    expect(clampToBounds(1000, 0, plate).x).toBe(40 + WALK_MARGIN_M);
  });
});
