import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_CAMERA_DISTANCE_M,
  DESKTOP_CAMERA_FOV_DEG,
  DIORAMA_POSITION,
  NAV_DISTANCE_MAX_M,
  NAV_DISTANCE_MIN_M,
  NAV_TARGET_MAX_LIFT_M,
  NAV_TARGET_RADIUS_M,
} from '../constants';
import { desktopCameraPose } from '../world-host';
import {
  PITCH_MAX,
  PITCH_MIN,
  VIEW_PRESETS,
  VIEW_PRESET_IDS,
  approachPose,
  cinematicDistance,
  cinematicPose,
  clampPose,
  fly,
  orbit,
  pan,
  poseToCamera,
  posesEqual,
  zoom,
  type OrbitPose,
} from './orbit-camera';

const finite = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const anyPose = fc
  .record({
    x: finite(-5, 5),
    y: finite(-5, 5),
    z: finite(-5, 5),
    yaw: finite(-20, 20),
    pitch: finite(-3, 3),
    distance: finite(-10, 20),
  })
  .map(({ x, y, z, yaw, pitch, distance }) => ({ target: { x, y, z }, yaw, pitch, distance }));

const key = fc.constantFrom(-1, 0, 1);
const op = fc.oneof(
  fc.record({ kind: fc.constant('orbit' as const), dx: finite(-2000, 2000), dy: finite(-2000, 2000) }),
  fc.record({
    kind: fc.constant('pan' as const),
    dx: finite(-2000, 2000),
    dy: finite(-2000, 2000),
    h: finite(1, 3000),
  }),
  fc.record({ kind: fc.constant('zoom' as const), f: finite(0.01, 50) }),
  fc.record({
    kind: fc.constant('fly' as const),
    keys: fc.record({ forward: key, right: key, turn: key, zoom: key, fast: fc.boolean() }),
    dt: finite(0, 5),
  }),
);
type Op = typeof op extends fc.Arbitrary<infer T> ? T : never;

function apply(pose: OrbitPose, o: Op): OrbitPose {
  if (o.kind === 'orbit') return orbit(pose, o.dx, o.dy);
  if (o.kind === 'pan') return pan(pose, o.dx, o.dy, o.h, 20);
  if (o.kind === 'zoom') return zoom(pose, o.f);
  return fly(pose, o.keys, o.dt);
}

function expectInBounds(p: OrbitPose): void {
  const c = DIORAMA_POSITION;
  expect(p.pitch).toBeGreaterThanOrEqual(PITCH_MIN);
  expect(p.pitch).toBeLessThanOrEqual(PITCH_MAX);
  expect(p.distance).toBeGreaterThanOrEqual(NAV_DISTANCE_MIN_M);
  expect(p.distance).toBeLessThanOrEqual(NAV_DISTANCE_MAX_M);
  expect(Math.abs(p.target.x - c.x)).toBeLessThanOrEqual(NAV_TARGET_RADIUS_M + 1e-12);
  expect(Math.abs(p.target.z - c.z)).toBeLessThanOrEqual(NAV_TARGET_RADIUS_M + 1e-12);
  expect(p.target.y).toBeGreaterThanOrEqual(c.y);
  expect(p.target.y).toBeLessThanOrEqual(c.y + NAV_TARGET_MAX_LIFT_M);
  expect(p.yaw).toBeGreaterThan(-Math.PI - 1e-12);
  expect(p.yaw).toBeLessThanOrEqual(Math.PI);
}

const ASPECTS = [16 / 9, 21 / 9, 4 / 3, 1, 9 / 16] as const;
const HALF_FOV = Math.tan((DESKTOP_CAMERA_FOV_DEG * Math.PI) / 360);

describe('cinematic camera and aspect ratio (I2 requirement 4)', () => {
  it('keeps the 16:9 framing and every wider framing exactly', () => {
    expect(cinematicDistance(16 / 9)).toBe(DESKTOP_CAMERA_DISTANCE_M);
    expect(cinematicDistance(21 / 9)).toBe(DESKTOP_CAMERA_DISTANCE_M);
    expect(cinematicDistance()).toBe(DESKTOP_CAMERA_DISTANCE_M);
    expect(desktopCameraPose(16 / 9)).toEqual(desktopCameraPose());
  });

  it.each(ASPECTS)('fits the plate width at aspect %f and stays inside the navigation bounds', (aspect) => {
    const pose = cinematicPose(aspect);
    expectInBounds(pose);
    const visibleWidth = 2 * pose.distance * HALF_FOV * aspect;
    const referenceWidth = 2 * DESKTOP_CAMERA_DISTANCE_M * HALF_FOV * (16 / 9);
    expect(visibleWidth).toBeGreaterThanOrEqual(referenceWidth - 1e-9);
  });

  it('moves the camera back monotonically as the view gets narrower', () => {
    const distances = ASPECTS.map((a) => cinematicDistance(a));
    for (let i = 1; i < distances.length; i++) expect(distances[i]!).toBeGreaterThanOrEqual(distances[i - 1]!);
  });

  it('uses the 16:9 framing for degenerate aspects', () => {
    for (const a of [0, -1, NaN, Infinity]) expect(cinematicDistance(a)).toBe(DESKTOP_CAMERA_DISTANCE_M);
  });

  it('looks at the same target from the same direction at every aspect', () => {
    const base = desktopCameraPose();
    for (const a of ASPECTS) {
      const p = desktopCameraPose(a);
      const k = cinematicDistance(a) / DESKTOP_CAMERA_DISTANCE_M;
      expect(p.target).toEqual(base.target);
      expect(p.position.x - p.target.x).toBeCloseTo((base.position.x - base.target.x) * k, 9);
      expect(p.position.y - p.target.y).toBeCloseTo((base.position.y - base.target.y) * k, 9);
    }
  });
});

describe('cinematicPose', () => {
  it('reproduces the desktop isometric camera of the default look', () => {
    const { position, target } = desktopCameraPose();
    const pose = cinematicPose();
    const cam = poseToCamera(pose);
    expect(cam.x).toBeCloseTo(position.x, 9);
    expect(cam.y).toBeCloseTo(position.y, 9);
    expect(cam.z).toBeCloseTo(position.z, 9);
    expect(pose.target).toEqual(target);
    expect(posesEqual(VIEW_PRESETS.overview, pose)).toBe(true);
  });

  it('defines every preset inside the bounds', () => {
    for (const id of VIEW_PRESET_IDS) expectInBounds(VIEW_PRESETS[id]);
  });
});

describe('gestures', () => {
  const base = cinematicPose();

  it('orbit: right drag decreases yaw, down drag raises the camera', () => {
    expect(orbit(base, 10, 0).yaw).toBeLessThan(base.yaw);
    expect(orbit(base, 0, 10).pitch).toBeGreaterThan(base.pitch);
  });

  it('pan: at yaw 0 a right drag moves the target toward −x, a down drag toward −z (away from the camera)', () => {
    const p = { ...base, yaw: 0 };
    const right = pan(p, 50, 0, 800, 20);
    expect(right.target.x).toBeLessThan(p.target.x);
    expect(right.target.z).toBeCloseTo(p.target.z, 12);
    const down = pan(p, 0, 50, 800, 20);
    expect(down.target.z).toBeLessThan(p.target.z);
    expect(down.target.y).toBe(p.target.y);
  });

  it('pan: one viewport height of drag moves the target by the visible height at the target', () => {
    const p = { ...base, yaw: 0, target: { ...DIORAMA_POSITION } };
    const moved = pan(p, 0, 100, 1000, 20);
    expect(p.target.z - moved.target.z).toBeCloseTo((2 * p.distance * Math.tan((10 * Math.PI) / 180)) / 10, 9);
  });

  it('zoom: factor < 1 comes closer and ignores non-positive factors', () => {
    expect(zoom(base, 0.5).distance).toBeCloseTo(base.distance * 0.5, 12);
    expect(zoom(base, 0).distance).toBe(base.distance);
  });

  it('fly: W moves the target toward the view direction, Q/E turn, + zooms in', () => {
    const p = { ...base, yaw: 0, target: { ...DIORAMA_POSITION } };
    const still = { forward: 0, right: 0, turn: 0, zoom: 0, fast: false };
    expect(fly(p, { ...still, forward: 1 }, 0.05).target.z).toBeLessThan(p.target.z);
    expect(fly(p, { ...still, right: 1 }, 0.05).target.x).toBeGreaterThan(p.target.x);
    expect(fly(p, { ...still, turn: 1 }, 0.05).yaw).toBeGreaterThan(p.yaw);
    expect(fly(p, { ...still, zoom: 1 }, 0.05).distance).toBeLessThan(p.distance);
    expect(fly(p, still, 0.05)).toBe(p);
    const slow = p.target.z - fly(p, { ...still, forward: 1 }, 0.05).target.z;
    const fast = p.target.z - fly(p, { ...still, forward: 1, fast: true }, 0.05).target.z;
    expect(fast).toBeGreaterThan(slow * 2);
  });

  it('fly: a stalled frame moves no more than the step cap', () => {
    const p = { ...base, target: { ...DIORAMA_POSITION } };
    const keys = { forward: 1, right: 0, turn: 0, zoom: 0, fast: false };
    expect(fly(p, keys, 10)).toEqual(fly(p, keys, 0.1));
  });
});

describe('bounds (property)', () => {
  it('clampPose always lands inside the bounds and is idempotent', () => {
    fc.assert(
      fc.property(anyPose, (pose) => {
        const c = clampPose(pose);
        expectInBounds(c);
        expect(clampPose(c)).toEqual(c);
      }),
    );
  });

  it('any sequence of gestures keeps the pose in bounds and the camera above the plate', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
        let pose = cinematicPose();
        for (const o of ops) {
          pose = apply(pose, o);
          expectInBounds(pose);
          const cam = poseToCamera(pose);
          expect(cam.y).toBeGreaterThan(DIORAMA_POSITION.y);
          const d = Math.hypot(cam.x - pose.target.x, cam.y - pose.target.y, cam.z - pose.target.z);
          expect(d).toBeCloseTo(pose.distance, 9);
        }
      }),
    );
  });

  it('zoom in then out by the inverse factor restores the distance when no clamp is hit', () => {
    fc.assert(
      fc.property(finite(0.5, 2), (f) => {
        const p = cinematicPose();
        expect(zoom(zoom(p, f), 1 / f).distance).toBeCloseTo(p.distance, 9);
      }),
    );
  });
});

describe('approachPose', () => {
  it('converges to the goal (returned as-is) and takes the shortest yaw path', () => {
    const from = { ...VIEW_PRESETS.top, yaw: Math.PI - 0.1 };
    const goal = { ...VIEW_PRESETS.top, yaw: -Math.PI + 0.1 };
    const step = approachPose(from, goal, 0.016);
    // Shortest path crosses ±π: yaw grows past π (wrapped to the negative side), never sweeps through 0.
    expect(Math.abs(step.yaw)).toBeGreaterThan(Math.PI - 0.1);
    let p: OrbitPose = VIEW_PRESETS.city;
    for (let i = 0; i < 600 && p !== VIEW_PRESETS.staff; i++) p = approachPose(p, VIEW_PRESETS.staff, 0.016);
    expect(p).toBe(VIEW_PRESETS.staff);
  });

  it('never leaves the bounds between two in-bounds poses (property)', () => {
    fc.assert(
      fc.property(anyPose, anyPose, finite(0, 1), (a, b, dt) => {
        expectInBounds(approachPose(clampPose(a), clampPose(b), dt));
      }),
    );
  });
});
