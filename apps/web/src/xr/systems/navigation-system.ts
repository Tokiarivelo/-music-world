/**
 * Writes the navigation pose to the desktop camera each frame (08-navigation-mode requirements 1, 4, 5, 6).
 * The controller owns the state; this system only feeds it frame time and copies the result to `world.camera`.
 * It never reads the audio clock or the spawn plan, and does nothing while an immersive session runs.
 */
import { createSystem, type World } from '@iwsdk/core';
import { ENV_FOG_FAR_M, IMMERSIVE_ENV_SCALE, NAV_MAX_STEP_SEC } from '../constants';
import { VIEW_SCALE, scaleStore, viewToWorld } from '../scale';
import { NavigationController } from '../navigation/navigation-controller';
import { poseToCamera, type OrbitPose } from '../navigation/orbit-camera';
import { isImmersive } from './xr-systems';

/** Camera surface used here (a subset of `PerspectiveCamera`). */
export interface NavigationCamera {
  position: { set(x: number, y: number, z: number): unknown };
  lookAt(x: number, y: number, z: number): unknown;
  fov: number;
}

export interface NavigationBinding {
  controller: NavigationController;
  camera: NavigationCamera;
  viewport: () => number;
}

let binding: NavigationBinding | null = null;

export class NavigationSystem extends createSystem({}) {
  private readonly eye = { x: 0, y: 0, z: 0 };
  private readonly at = { x: 0, y: 0, z: 0 };
  private written: OrbitPose | null = null;
  private writtenMode = scaleStore.mode;

  update(delta: number): void {
    const b = binding;
    if (!b) return;
    const dt = Math.min(Math.max(delta, 0), NAV_MAX_STEP_SEC);
    const pose = b.controller.step(dt, isImmersive(this.world), b.viewport(), b.camera.fov);
    if (!pose) {
      this.written = null; // rewrite the pose when the session ends (requirement 5.3)
      const walking = b.controller.consumeWalkCamera();
      if (walking) {
        b.camera.position.set(walking.eye.x, walking.eye.y, walking.eye.z);
        b.camera.lookAt(walking.at.x, walking.at.y, walking.at.z);
      }
      return;
    }
    const mode = scaleStore.mode;
    if (this.written === pose && this.writtenMode === mode) return;
    this.written = pose;
    this.writtenMode = mode;
    poseToCamera(pose, this.eye);
    viewToWorld(this.eye, mode, this.eye);
    viewToWorld(pose.target, mode, this.at);
    b.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
    b.camera.lookAt(this.at.x, this.at.y, this.at.z);
    // From high above the plate the fog must still let the whole world through.
    const reach = pose.distance * (mode === 'immersive' ? VIEW_SCALE : 1) * 2.4;
    scaleStore.setFogBoost(reach / (ENV_FOG_FAR_M * (mode === 'immersive' ? IMMERSIVE_ENV_SCALE : 1)));
  }
}

/** Registers the navigation system; returns the controller the world host commands. */
export function installNavigation(
  world: World,
  camera: NavigationCamera,
  viewport: () => number,
): NavigationController {
  const controller = new NavigationController();
  binding = { controller, camera, viewport };
  world.registerSystem(NavigationSystem);
  return controller;
}

export function disposeNavigation(controller: NavigationController): void {
  if (binding?.controller === controller) binding = null;
}
