/**
 * Creates and tears down the IWSDK world. React only mounts a container and talks to the world through
 * the returned {@link WorldHandle} (see frontend.md: "3D stays out of React").
 *
 * IWSDK 1.1.0 API checked against the installed typings: `World.create`, `launchXR`, `exitXR`, `destroy`
 * (stops systems + render loop and runs system cleanups, which dispose the views; does not dispose the renderer, so
 * we do it here).
 */
import type * as IWSDK from '@iwsdk/core';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, WorldTemplate } from '@/engine/types';
import {
  DESKTOP_CAMERA_DIRECTION,
  DESKTOP_CAMERA_DISTANCE_M,
  DESKTOP_CAMERA_FOV_DEG,
  DIORAMA_POSITION,
} from './constants';
import type { MusicScene, WorldClock } from './systems/world-systems';

/** What the world shows: built once into a spawn plan, then rendered from `clock.now()` every frame. */
export interface WorldScene {
  analysis: EngineAnalysis;
  template: WorldTemplate;
  seed: number;
  clock: WorldClock;
}

export interface WorldHandle {
  /** Replaces the song, template, seed or clock (typed command API, frontend.md). */
  load(scene: WorldScene): void;
  enterVR(): void;
  exitVR(): void;
  isVRSupported(): Promise<boolean>;
  dispose(): void;
}

type WorldLike = Pick<IWSDK.World, 'launchXR' | 'exitXR' | 'destroy'> & {
  camera: Pick<IWSDK.World['camera'], 'position' | 'lookAt' | 'fov' | 'updateProjectionMatrix'>;
  renderer: Pick<IWSDK.World['renderer'], 'dispose' | 'forceContextLoss' | 'domElement'>;
  session: XRSession | undefined;
};

export interface WorldHostDeps {
  installEmulator(): Promise<void>;
  createWorld(container: HTMLElement): Promise<WorldLike>;
  /** Registers the music systems on the world (`installMusicSystems`). */
  installScene(world: WorldLike): Promise<Pick<MusicScene, 'setScene'>>;
  xr(): Pick<XRSystem, 'isSessionSupported'> | undefined;
}

let emulatorInstalled = false;
// IWSDK 1.1.0: two concurrent World.create calls leave one pending forever (seen with React StrictMode's
// double mount), so world creation is serialized.
let creationQueue: Promise<unknown> = Promise.resolve();

const defaultDeps: WorldHostDeps = {
  async installEmulator() {
    if (process.env.NODE_ENV !== 'development' || emulatorInstalled) return;
    // Desktop Chrome exposes a native navigator.xr without a headset: replace it with the emulator.
    // A real headset (Quest Browser) keeps its native runtime.
    const nativeVR = await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false);
    if (nativeVR) return;
    const { XRDevice, metaQuest3 } = await import('iwer');
    new XRDevice(metaQuest3).installRuntime({ forceInstall: true }); // before World.create; once per page
    emulatorInstalled = true;
  },
  async createWorld(container) {
    const { World, SessionMode, ReferenceSpaceType } = await import('@iwsdk/core');
    return World.create(container, {
      xr: { sessionMode: SessionMode.ImmersiveVR, referenceSpace: ReferenceSpaceType.LocalFloor, offer: 'none' },
    });
  },
  async installScene(world) {
    const { installMusicSystems } = await import('./systems/world-systems');
    return installMusicSystems(world as IWSDK.World);
  },
  xr: () => (typeof navigator === 'undefined' ? undefined : navigator.xr),
};

export function createMusicWorld(container: HTMLDivElement, deps: WorldHostDeps = defaultDeps): Promise<WorldHandle> {
  const run = creationQueue.then(() => buildWorld(container, deps));
  creationQueue = run.catch(() => undefined);
  return run;
}

async function buildWorld(container: HTMLDivElement, deps: WorldHostDeps): Promise<WorldHandle> {
  await deps.installEmulator();
  const world = await deps.createWorld(container);
  const scene = await deps.installScene(world);
  // Desktop isometric view of the diorama; in XR the headset pose drives the camera (restored on exit by IWSDK).
  const d = DESKTOP_CAMERA_DIRECTION;
  const norm = Math.hypot(d.x, d.y, d.z);
  const k = DESKTOP_CAMERA_DISTANCE_M / norm;
  world.camera.fov = DESKTOP_CAMERA_FOV_DEG;
  world.camera.updateProjectionMatrix();
  world.camera.position.set(DIORAMA_POSITION.x + d.x * k, DIORAMA_POSITION.y + d.y * k, DIORAMA_POSITION.z + d.z * k);
  world.camera.lookAt(DIORAMA_POSITION.x, DIORAMA_POSITION.y, DIORAMA_POSITION.z);
  let disposed = false;

  return {
    load({ analysis, template, seed, clock }) {
      if (disposed) return;
      scene.setScene(buildSpawnPlan(analysis, template, seed), clock);
    },
    enterVR: () => world.launchXR(),
    exitVR: () => world.exitXR(),
    async isVRSupported() {
      const xr = deps.xr();
      return xr ? xr.isSessionSupported('immersive-vr').catch(() => false) : false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (world.session) world.exitXR();
      world.destroy();
      world.renderer.dispose();
      world.renderer.forceContextLoss();
      world.renderer.domElement.remove();
    },
  };
}
