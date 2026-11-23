/**
 * Creates and tears down the IWSDK world. React only mounts a container and talks to the world through
 * the returned {@link WorldHandle} (see frontend.md: "3D stays out of React").
 *
 * IWSDK 1.1.0 API checked against the installed typings: `World.create`, `launchXR`, `exitXR`, `destroy`
 * (stops systems + render loop; does not dispose the renderer, so we do it here).
 */
import type * as IWSDK from '@iwsdk/core';
import { createDemoCube } from './demo-cube';

const DESKTOP_CAMERA = { position: [0, 1.6, 0.6] as const };

export interface WorldHandle {
  enterVR(): void;
  exitVR(): void;
  isVRSupported(): Promise<boolean>;
  dispose(): void;
}

type WorldLike = Pick<IWSDK.World, 'launchXR' | 'exitXR' | 'destroy' | 'createTransformEntity'> & {
  camera: Pick<IWSDK.World['camera'], 'position' | 'lookAt'>;
  renderer: Pick<IWSDK.World['renderer'], 'dispose' | 'forceContextLoss' | 'domElement'>;
  session: XRSession | undefined;
};

export interface WorldHostDeps {
  installEmulator(): Promise<void>;
  createWorld(container: HTMLElement): Promise<WorldLike>;
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
  xr: () => (typeof navigator === 'undefined' ? undefined : navigator.xr),
};

export function createMusicWorld(
  container: HTMLDivElement,
  deps: WorldHostDeps = defaultDeps,
): Promise<WorldHandle> {
  const run = creationQueue.then(() => buildWorld(container, deps));
  creationQueue = run.catch(() => undefined);
  return run;
}

async function buildWorld(container: HTMLDivElement, deps: WorldHostDeps): Promise<WorldHandle> {
  await deps.installEmulator();
  const world = await deps.createWorld(container);
  const cube = createDemoCube();
  world.createTransformEntity(cube.mesh);
  // Desktop view only; in XR the headset pose drives the camera (restored on exit by IWSDK).
  world.camera.position.set(...DESKTOP_CAMERA.position);
  world.camera.lookAt(cube.mesh.position);
  let disposed = false;

  return {
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
      cube.dispose();
      world.renderer.dispose();
      world.renderer.forceContextLoss();
      world.renderer.domElement.remove();
    },
  };
}
