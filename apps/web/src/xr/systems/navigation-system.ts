/**
 * Writes the navigation pose to the desktop camera each frame (08-navigation-mode requirements 1, 4, 5, 6).
 * The controller owns the state; this system only feeds it frame time and copies the result to `world.camera`.
 * It never reads the audio clock or the spawn plan, and does nothing while an immersive session runs.
 */
import { createSystem, type World } from '@iwsdk/core';
import { NAV_MAX_STEP_SEC } from '../constants';
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
  private written: OrbitPose | null = null;

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
    if (this.written === pose) return;
    this.written = pose;
    poseToCamera(pose, this.eye);
    b.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
    b.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
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
