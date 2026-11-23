/**
 * Creates and tears down the IWSDK world. React only mounts a container and talks to the world through
 * the returned {@link WorldHandle} (see frontend.md: "3D stays out of React").
 *
 * IWSDK 1.1.0 API checked against the installed typings: `World.create`, `launchXR`, `exitXR`, `destroy`
 * (stops systems + render loop and runs system cleanups, which dispose the views; does not dispose the renderer, so
 * we do it here), `visibilityState` (signal, `'non-immersive'` outside XR), `xr.features.handTracking`.
 */
import type * as IWSDK from '@iwsdk/core';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, WorldTemplate } from '@/engine/types';
import {
  DESKTOP_CAMERA_AZIMUTH_DEG,
  DESKTOP_CAMERA_DISTANCE_M,
  DESKTOP_CAMERA_ELEVATION_DEG,
  DESKTOP_CAMERA_FOV_DEG,
  DESKTOP_CAMERA_TARGET_OFFSET,
  DIORAMA_POSITION,
} from './constants';
import type { MusicScene, WorldClock } from './systems/world-systems';
import type { WorldControls } from './systems/xr-systems';

export type { TemplateChoice, WorldControls } from './systems/xr-systems';

/** What the world shows: built once into a spawn plan, then rendered from `clock.now()` every frame. */
export interface WorldScene {
  analysis: EngineAnalysis;
  template: WorldTemplate;
  seed: number;
  clock: WorldClock;
}

/** What the host needs from the installed systems. */
export interface InstalledScene extends Pick<MusicScene, 'setScene'> {
  setControls(controls: WorldControls | null): void;
}

export interface WorldHandle {
  /** Replaces the song, template, seed or clock (typed command API, frontend.md). */
  load(scene: WorldScene): void;
  enterVR(): void;
  exitVR(): void;
  /**
   * Player commands used in VR (controllers, spatial panel, pinch; 07-xr-mode requirements 3–5): the same functions
   * as the 2D player bar. Cheap: does not rebuild the world.
   */
  setControls(controls: WorldControls | null): void;
  /** Calls `listener(immersive)` now and whenever an XR session starts or ends; returns an unsubscribe function. */
  onSessionChange(listener: (immersive: boolean) => void): () => void;
  isVRSupported(): Promise<boolean>;
  dispose(): void;
}

type WorldLike = Pick<IWSDK.World, 'launchXR' | 'exitXR' | 'destroy'> & {
  camera: Pick<IWSDK.World['camera'], 'position' | 'lookAt' | 'fov' | 'updateProjectionMatrix'>;
  renderer: Pick<IWSDK.World['renderer'], 'dispose' | 'forceContextLoss' | 'domElement'>;
  session: XRSession | undefined;
  visibilityState: { readonly value: string; subscribe(fn: (value: string) => void): () => void };
};

export interface WorldHostDeps {
  installEmulator(): Promise<void>;
  createWorld(container: HTMLElement): Promise<WorldLike>;
  /** Registers the music systems on the world (`installMusicSystems`). */
  installScene(world: WorldLike): Promise<InstalledScene>;
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
    const device = new XRDevice(metaQuest3);
    device.installRuntime({ forceInstall: true }); // before World.create; once per page
    // Development only: lets the IWER check script (07-xr-mode) drive the emulated controllers and hands.
    devHooks().__mwXRDevice = device;
    emulatorInstalled = true;
  },
  async createWorld(container) {
    const { World, SessionMode, ReferenceSpaceType } = await import('@iwsdk/core');
    return World.create(container, {
      xr: {
        sessionMode: SessionMode.ImmersiveVR,
        referenceSpace: ReferenceSpaceType.LocalFloor,
        offer: 'none',
        // Optional: controllers keep working when the runtime has no hand tracking (07-xr-mode requirement 1.2).
        features: { handTracking: true },
      },
    });
  },
  async installScene(world) {
    const { installMusicSystems } = await import('./systems/world-systems');
    const { installXRSystems } = await import('./systems/xr-systems');
    const { installXRPanel } = await import('./systems/xr-panel-system');
    // `?perf=1` logs draw calls and triangles once per second (04-default-template requirement 7.3).
    const perfLog = typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1';
    const scene = installMusicSystems(world as IWSDK.World, { perfLog });
    const rig = installXRSystems(world as IWSDK.World, scene.anchorEntity, scene.anchor);
    installXRPanel(world as IWSDK.World, scene.anchorEntity, rig);
    return {
      setScene: (plan, clock) => scene.setScene(plan, clock),
      setControls: (controls) => {
        rig.controls = controls;
      },
    };
  },
  xr: () => (typeof navigator === 'undefined' ? undefined : navigator.xr),
};

/** Development-only globals read by the IWER check script (`scripts/xr-check.mjs`). */
function devHooks(): { __mwWorld?: unknown; __mwXRDevice?: unknown } {
  return globalThis as { __mwWorld?: unknown; __mwXRDevice?: unknown };
}

/** `VisibilityState.NonImmersive` of IWSDK (kept as a literal so this module does not load IWSDK eagerly). */
const NON_IMMERSIVE = 'non-immersive';

type Point = { x: number; y: number; z: number };

/** Desktop isometric pose (04-default-template requirement 1): azimuth / elevation around the diorama centre. */
export function desktopCameraPose(): { position: Point; target: Point } {
  const az = (DESKTOP_CAMERA_AZIMUTH_DEG * Math.PI) / 180;
  const el = (DESKTOP_CAMERA_ELEVATION_DEG * Math.PI) / 180;
  const target = {
    x: DIORAMA_POSITION.x + DESKTOP_CAMERA_TARGET_OFFSET.x,
    y: DIORAMA_POSITION.y + DESKTOP_CAMERA_TARGET_OFFSET.y,
    z: DIORAMA_POSITION.z + DESKTOP_CAMERA_TARGET_OFFSET.z,
  };
  const r = DESKTOP_CAMERA_DISTANCE_M;
  return {
    position: {
      x: target.x + r * Math.cos(el) * Math.sin(az),
      y: target.y + r * Math.sin(el),
      z: target.z + r * Math.cos(el) * Math.cos(az),
    },
    target,
  };
}

export function createMusicWorld(container: HTMLDivElement, deps: WorldHostDeps = defaultDeps): Promise<WorldHandle> {
  const run = creationQueue.then(() => buildWorld(container, deps));
  creationQueue = run.catch(() => undefined);
  return run;
}

async function buildWorld(container: HTMLDivElement, deps: WorldHostDeps): Promise<WorldHandle> {
  await deps.installEmulator();
  const world = await deps.createWorld(container);
  const scene = await deps.installScene(world);
  if (process.env.NODE_ENV === 'development') devHooks().__mwWorld = world; // read by scripts/xr-check.mjs
  // Desktop isometric view of the diorama; in XR the headset pose drives the camera (restored on exit by IWSDK).
  const { position, target } = desktopCameraPose();
  world.camera.fov = DESKTOP_CAMERA_FOV_DEG;
  world.camera.updateProjectionMatrix();
  world.camera.position.set(position.x, position.y, position.z);
  world.camera.lookAt(target.x, target.y, target.z);
  let disposed = false;

  return {
    load({ analysis, template, seed, clock }) {
      if (disposed) return;
      scene.setScene(buildSpawnPlan(analysis, template, seed), clock);
    },
    setControls(controls) {
      if (!disposed) scene.setControls(controls);
    },
    enterVR: () => world.launchXR(),
    exitVR: () => world.exitXR(),
    onSessionChange(listener) {
      // `subscribe` calls the listener at once with the current value, then on every change.
      return world.visibilityState.subscribe((state) => listener(state !== NON_IMMERSIVE));
    },
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
      if (devHooks().__mwWorld === world) delete devHooks().__mwWorld;
    },
  };
}
