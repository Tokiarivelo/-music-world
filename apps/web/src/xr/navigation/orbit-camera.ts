/**
 * Pure orbit-camera math of the navigation mode (08-navigation-mode requirements 1, 2, 4): a pose around a target on
 * the diorama, the gestures that change it and the clamps that keep the plate in view. No three.js, no DOM: every
 * function returns a new clamped pose.
 *
 * Convention (same as `desktopCameraPose()`): camera = target + distance · (cos pitch · sin yaw, sin pitch,
 * cos pitch · cos yaw). Yaw 0 looks along −z from the +z side; pitch is the elevation above the plate.
 */
import {
  DESKTOP_CAMERA_AZIMUTH_DEG,
  DESKTOP_CAMERA_DISTANCE_M,
  DESKTOP_CAMERA_ELEVATION_DEG,
  DESKTOP_CAMERA_TARGET_OFFSET,
  DESKTOP_REFERENCE_ASPECT,
  DIORAMA_POSITION,
  NAV_DISTANCE_MAX_M,
  NAV_DISTANCE_MIN_M,
  NAV_EASE_PER_SEC,
  NAV_FAST_FACTOR,
  NAV_FLY_SPEED,
  NAV_KEY_ZOOM_RATE,
  NAV_MAX_STEP_SEC,
  NAV_PITCH_MAX_DEG,
  NAV_PITCH_MIN_DEG,
  NAV_ROTATE_RAD_PER_PX,
  NAV_TARGET_MAX_LIFT_M,
  NAV_TARGET_RADIUS_M,
  NAV_TURN_SPEED_RAD,
} from '../constants';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface OrbitPose {
  readonly target: Readonly<Vec3>;
  /** Radians, wrapped to (−π, π]. */
  readonly yaw: number;
  /** Radians above the plate. */
  readonly pitch: number;
  /** Metres from the target. */
  readonly distance: number;
}

export type ViewPresetId = 'overview' | 'staff' | 'city' | 'top';
export const VIEW_PRESET_IDS: readonly ViewPresetId[] = ['overview', 'staff', 'city', 'top'];

/** Keyboard axes held this frame: each in {−1, 0, 1}. */
export interface FlyKeys {
  /** +1 forward (W), −1 backward (S). */
  forward: number;
  /** +1 right (D), −1 left (A). */
  right: number;
  /** +1 turn right (E), −1 turn left (Q). */
  turn: number;
  /** +1 zoom in (+), −1 zoom out (−). */
  zoom: number;
  fast: boolean;
}

const DEG = Math.PI / 180;
export const PITCH_MIN = NAV_PITCH_MIN_DEG * DEG;
export const PITCH_MAX = NAV_PITCH_MAX_DEG * DEG;
const EPSILON = 1e-4;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Wraps an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  if (a > -Math.PI && a <= Math.PI) return a; // already wrapped: keep it exact (clampPose is idempotent)
  const w = Math.atan2(Math.sin(a), Math.cos(a));
  return w === -Math.PI ? Math.PI : w;
}

/** Keeps the pose inside the navigation bounds (requirement 2.2). Non-finite values fall back to the cinematic pose. */
export function clampPose(pose: OrbitPose): OrbitPose {
  const c = DIORAMA_POSITION;
  const { target } = pose;
  const values = [target.x, target.y, target.z, pose.yaw, pose.pitch, pose.distance];
  if (!values.every(Number.isFinite)) return cinematicPose();
  return {
    target: {
      x: clamp(target.x, c.x - NAV_TARGET_RADIUS_M, c.x + NAV_TARGET_RADIUS_M),
      y: clamp(target.y, c.y, c.y + NAV_TARGET_MAX_LIFT_M),
      z: clamp(target.z, c.z - NAV_TARGET_RADIUS_M, c.z + NAV_TARGET_RADIUS_M),
    },
    yaw: wrapAngle(pose.yaw),
    pitch: clamp(pose.pitch, PITCH_MIN, PITCH_MAX),
    distance: clamp(pose.distance, NAV_DISTANCE_MIN_M, NAV_DISTANCE_MAX_M),
  };
}

/** Camera position of a pose (writes into `out` so the system does not allocate per frame). */
export function poseToCamera(pose: OrbitPose, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const { target, yaw, pitch, distance } = pose;
  out.x = target.x + distance * Math.cos(pitch) * Math.sin(yaw);
  out.y = target.y + distance * Math.sin(pitch);
  out.z = target.z + distance * Math.cos(pitch) * Math.cos(yaw);
  return out;
}

function presetPose(offset: Vec3, yawDeg: number, pitchDeg: number, distance: number): OrbitPose {
  const c = DIORAMA_POSITION;
  return clampPose({
    target: { x: c.x + offset.x, y: c.y + offset.y, z: c.z + offset.z },
    yaw: yawDeg * DEG,
    pitch: pitchDeg * DEG,
    distance,
  });
}

/**
 * Cinematic camera distance for an aspect ratio (I2 requirement 4): the plate fits the height on landscape (the 16:9
 * distance is kept for every wider view) and its width on portrait. Non-finite or non-positive aspects use 16:9.
 */
export function cinematicDistance(aspect: number = DESKTOP_REFERENCE_ASPECT): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : DESKTOP_REFERENCE_ASPECT;
  return DESKTOP_CAMERA_DISTANCE_M * Math.max(1, DESKTOP_REFERENCE_ASPECT / a);
}

/** The fixed isometric pose of the default look (requirement 1.1): equals `desktopCameraPose()` at 16:9. */
export function cinematicPose(aspect: number = DESKTOP_REFERENCE_ASPECT): OrbitPose {
  return presetPose(
    DESKTOP_CAMERA_TARGET_OFFSET,
    DESKTOP_CAMERA_AZIMUTH_DEG,
    DESKTOP_CAMERA_ELEVATION_DEG,
    cinematicDistance(aspect),
  );
}

/** View presets (requirement 4.1, `design.md` § Camera pose). The city of `neon-nocturne` lies on the −x side. */
export const VIEW_PRESETS: Readonly<Record<ViewPresetId, OrbitPose>> = {
  overview: cinematicPose(),
  staff: presetPose({ x: 0, y: 0.1, z: 0 }, 27, 20, 1.1),
  city: presetPose({ x: -0.38, y: 0.12, z: -0.2 }, -40, 24, 1.2),
  top: presetPose({ x: 0, y: 0, z: 0 }, 0, 85, 3.2),
};

/** Drag orbit: right drag turns the view around the target, down drag raises the camera. */
export function orbit(pose: OrbitPose, dxPx: number, dyPx: number): OrbitPose {
  return clampPose({
    ...pose,
    yaw: pose.yaw - dxPx * NAV_ROTATE_RAD_PER_PX,
    pitch: pose.pitch + dyPx * NAV_ROTATE_RAD_PER_PX,
  });
}

/** Ground-plane "grab" pan: the plate follows the pointer (`viewportPx` = canvas height in CSS pixels). */
export function pan(pose: OrbitPose, dxPx: number, dyPx: number, viewportPx: number, fovDeg: number): OrbitPose {
  const metresPerPx = (2 * pose.distance * Math.tan((fovDeg * DEG) / 2)) / Math.max(1, viewportPx);
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  // right = (cos, 0, −sin), forward = (−sin, 0, −cos); drag right → target left, drag down → target forward.
  const r = -dxPx * metresPerPx;
  const f = dyPx * metresPerPx;
  return clampPose({
    ...pose,
    target: { x: pose.target.x + r * cos - f * sin, y: pose.target.y, z: pose.target.z - r * sin - f * cos },
  });
}

/** Zoom toward the target: factor < 1 comes closer. */
export function zoom(pose: OrbitPose, factor: number): OrbitPose {
  return clampPose({ ...pose, distance: pose.distance * (factor > 0 ? factor : 1) });
}

/** Keyboard fly (requirement 3.1): ground move relative to the view, turn and zoom; `dtSec` capped. */
export function fly(pose: OrbitPose, keys: FlyKeys, dtSec: number): OrbitPose {
  const dt = clamp(dtSec, 0, NAV_MAX_STEP_SEC);
  if (dt === 0 || (keys.forward === 0 && keys.right === 0 && keys.turn === 0 && keys.zoom === 0)) return pose;
  const speed = NAV_FLY_SPEED * pose.distance * (keys.fast ? NAV_FAST_FACTOR : 1) * dt;
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  const r = keys.right * speed;
  const f = keys.forward * speed;
  return clampPose({
    target: { x: pose.target.x + r * cos - f * sin, y: pose.target.y, z: pose.target.z - r * sin - f * cos },
    yaw: pose.yaw + keys.turn * NAV_TURN_SPEED_RAD * dt,
    pitch: pose.pitch,
    distance: pose.distance * Math.exp(-keys.zoom * NAV_KEY_ZOOM_RATE * dt),
  });
}

/** True when two poses are the same within a small tolerance (no camera write needed). */
export function posesEqual(a: OrbitPose, b: OrbitPose): boolean {
  return (
    Math.abs(a.target.x - b.target.x) < EPSILON &&
    Math.abs(a.target.y - b.target.y) < EPSILON &&
    Math.abs(a.target.z - b.target.z) < EPSILON &&
    Math.abs(wrapAngle(a.yaw - b.yaw)) < EPSILON &&
    Math.abs(a.pitch - b.pitch) < EPSILON &&
    Math.abs(a.distance - b.distance) < EPSILON
  );
}

/**
 * Exponential easing toward `goal` (requirement 4.4), shortest yaw path; returns `goal` itself once close. Camera
 * only: frame time never schedules a world event.
 */
export function approachPose(current: OrbitPose, goal: OrbitPose, dtSec: number): OrbitPose {
  if (posesEqual(current, goal)) return goal;
  const k = 1 - Math.exp(-NAV_EASE_PER_SEC * clamp(dtSec, 0, NAV_MAX_STEP_SEC));
  const mix = (a: number, b: number): number => a + (b - a) * k;
  const next: OrbitPose = clampPose({
    target: {
      x: mix(current.target.x, goal.target.x),
      y: mix(current.target.y, goal.target.y),
      z: mix(current.target.z, goal.target.z),
    },
    yaw: current.yaw + wrapAngle(goal.yaw - current.yaw) * k,
    pitch: mix(current.pitch, goal.pitch),
    distance: mix(current.distance, goal.distance),
  });
  return posesEqual(next, goal) ? goal : next;
}
