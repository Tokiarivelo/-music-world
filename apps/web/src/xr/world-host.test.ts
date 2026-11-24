import { describe, expect, it, vi } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { DESKTOP_CAMERA_AZIMUTH_DEG, DESKTOP_CAMERA_DISTANCE_M, DESKTOP_CAMERA_ELEVATION_DEG } from './constants';
import { NavigationController } from './navigation/navigation-controller';
import { createMusicWorld, desktopCameraPose, type WorldHostDeps } from './world-host';

/** Minimal preact-like signal: `subscribe` calls back at once, then on each change. */
function fakeSignal(initial: string) {
  const listeners = new Set<(value: string) => void>();
  const signal = {
    value: initial,
    set(value: string) {
      signal.value = value;
      listeners.forEach((fn) => fn(value));
    },
    subscribe(fn: (value: string) => void) {
      listeners.add(fn);
      fn(signal.value);
      return () => listeners.delete(fn);
    },
  };
  return signal;
}

function fakeDeps(withSession = false) {
  const worlds: Array<ReturnType<typeof makeWorld>> = [];
  const navigation = new NavigationController();
  const scene = { setScene: vi.fn(), setControls: vi.fn(), navigation, disposeNavigation: vi.fn() };
  function makeWorld(container: HTMLElement) {
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    return {
      launchXR: vi.fn(),
      exitXR: vi.fn(),
      destroy: vi.fn(),
      camera: { position: { set: vi.fn() }, lookAt: vi.fn(), fov: 50, updateProjectionMatrix: vi.fn() },
      session: withSession ? ({} as XRSession) : undefined,
      visibilityState: fakeSignal(withSession ? 'visible' : 'non-immersive'),
      renderer: { dispose: vi.fn(), forceContextLoss: vi.fn(), domElement: canvas },
    };
  }
  const deps = {
    installEmulator: vi.fn(async () => {}),
    createWorld: vi.fn(async (container: HTMLElement) => {
      const world = makeWorld(container);
      worlds.push(world);
      return world as unknown as Awaited<ReturnType<WorldHostDeps['createWorld']>>;
    }),
    installScene: vi.fn(async () => scene),
    xr: () => undefined,
  } satisfies WorldHostDeps;
  return { deps, worlds, scene };
}

describe('createMusicWorld', () => {
  it('releases the world, renderer and canvas on every one of 5 mount/unmount cycles', async () => {
    const container = document.createElement('div');
    const { deps, worlds } = fakeDeps();
    for (let i = 0; i < 5; i++) {
      const handle = await createMusicWorld(container, deps);
      expect(container.querySelectorAll('canvas')).toHaveLength(1);
      handle.dispose();
      handle.dispose(); // idempotent
      expect(container.querySelectorAll('canvas')).toHaveLength(0);
    }
    expect(deps.installEmulator).toHaveBeenCalledTimes(5);
    for (const world of worlds) {
      expect(world.destroy).toHaveBeenCalledOnce();
      expect(world.renderer.dispose).toHaveBeenCalledOnce();
      expect(world.renderer.forceContextLoss).toHaveBeenCalledOnce();
      expect(world.exitXR).not.toHaveBeenCalled();
    }
  });

  it('serializes concurrent creations (IWSDK cannot init two worlds at once)', async () => {
    const { deps } = fakeDeps();
    let active = 0;
    let maxActive = 0;
    const create = deps.createWorld;
    deps.createWorld = vi.fn(async (container: HTMLElement) => {
      maxActive = Math.max(maxActive, ++active);
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      active--;
      return create(container);
    });
    const handles = await Promise.all([1, 2, 3].map(() => createMusicWorld(document.createElement('div'), deps)));
    expect(maxActive).toBe(1);
    handles.forEach((h) => h.dispose());
  });

  it('exits an active XR session before destroying', async () => {
    const { deps, worlds } = fakeDeps(true);
    (await createMusicWorld(document.createElement('div'), deps)).dispose();
    expect(worlds[0]?.exitXR).toHaveBeenCalledOnce();
  });

  it('reports VR unsupported when WebXR is missing (Enter VR stays hidden)', async () => {
    const { deps } = fakeDeps();
    expect(await (await createMusicWorld(document.createElement('div'), deps)).isVRSupported()).toBe(false);
  });
});

describe('WorldHandle.onSessionChange (07-xr-mode requirement 1.3)', () => {
  it('reports the current state, then each session start and end, until unsubscribed', async () => {
    const { deps, worlds } = fakeDeps();
    const handle = await createMusicWorld(document.createElement('div'), deps);
    const seen: boolean[] = [];
    const off = handle.onSessionChange((immersive) => seen.push(immersive));
    worlds[0]!.visibilityState.set('visible');
    worlds[0]!.visibilityState.set('visible-blurred');
    worlds[0]!.visibilityState.set('non-immersive');
    off();
    worlds[0]!.visibilityState.set('visible');
    expect(seen).toEqual([false, true, true, false]);
    handle.dispose();
  });
});

describe('WorldHandle.setControls (07-xr-mode requirement 3.4)', () => {
  it('hands the player commands to the XR systems without rebuilding the world', async () => {
    const { deps, scene } = fakeDeps();
    const handle = await createMusicWorld(document.createElement('div'), deps);
    const controls = {
      toggle: vi.fn(),
      seekBy: vi.fn(),
      seek: vi.fn(),
      isPlaying: () => false,
      duration: () => 10,
      title: 'Song',
      templates: [{ id: 'a', name: 'A' }],
      templateId: 'a',
      selectTemplate: vi.fn(),
    };
    handle.setControls(controls);
    expect(scene.setControls).toHaveBeenLastCalledWith(controls);
    expect(scene.setScene).not.toHaveBeenCalled();
    handle.dispose();
    handle.setControls(null);
    expect(scene.setControls).toHaveBeenCalledOnce();
  });
});

describe('WorldHandle.load', () => {
  it('builds the spawn plan once and hands it to the scene with the audio clock', async () => {
    const { deps, scene } = fakeDeps();
    const handle = await createMusicWorld(document.createElement('div'), deps);
    const clock = { now: () => 0 };
    handle.load({ analysis: demo, template: DEFAULT_TEMPLATE, seed: 1, clock });
    expect(scene.setScene).toHaveBeenCalledOnce();
    const [plan, passedClock] = scene.setScene.mock.calls[0]!;
    expect(plan).toEqual(buildSpawnPlan(demo, DEFAULT_TEMPLATE, 1));
    expect(passedClock).toBe(clock);
    handle.load({ analysis: demo, template: DEFAULT_TEMPLATE, seed: 1, clock });
    handle.dispose();
    handle.load({ analysis: demo, template: DEFAULT_TEMPLATE, seed: 1, clock });
    expect(scene.setScene).toHaveBeenCalledTimes(2);
  });
});

describe('desktop camera (04-default-template requirement 1)', () => {
  it('looks down at the configured elevation and azimuth from the configured distance', () => {
    const { position, target } = desktopCameraPose();
    const dx = position.x - target.x;
    const dy = position.y - target.y;
    const dz = position.z - target.z;
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(DESKTOP_CAMERA_DISTANCE_M, 9);
    expect((Math.asin(dy / DESKTOP_CAMERA_DISTANCE_M) * 180) / Math.PI).toBeCloseTo(DESKTOP_CAMERA_ELEVATION_DEG, 9);
    expect((Math.atan2(dx, dz) * 180) / Math.PI).toBeCloseTo(DESKTOP_CAMERA_AZIMUTH_DEG, 9);
    expect(DESKTOP_CAMERA_ELEVATION_DEG).toBeGreaterThanOrEqual(25);
    expect(DESKTOP_CAMERA_ELEVATION_DEG).toBeLessThanOrEqual(35);
  });
});

describe('WorldHandle navigation commands (08-navigation-mode requirements 1, 4, 6.3)', () => {
  it('switches modes, selects presets and resets, reporting each change', async () => {
    const { deps, scene } = fakeDeps();
    const handle = await createMusicWorld(document.createElement('div'), deps);
    const seen: Array<[string, string | null]> = [];
    const off = handle.onNavigationChange((s) => seen.push([s.mode, s.preset]));
    handle.setCameraMode('explore');
    handle.setViewPreset('top');
    handle.resetView();
    handle.setCameraMode('cinematic');
    off();
    handle.setCameraMode('explore');
    expect(seen).toEqual([
      ['cinematic', null],
      ['explore', 'overview'],
      ['explore', 'top'],
      ['explore', 'overview'],
      ['cinematic', null],
    ]);
    expect(scene.setScene).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('takes pointer input only in the explore mode and unbinds on dispose', async () => {
    const { deps, scene, worlds } = fakeDeps();
    const handle = await createMusicWorld(document.createElement('div'), deps);
    const canvas = worlds[0]!.renderer.domElement;
    const wheel = (): WheelEvent => {
      const e = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
      canvas.dispatchEvent(e);
      return e;
    };
    expect(wheel().defaultPrevented).toBe(false);
    handle.setCameraMode('explore');
    expect(canvas.style.touchAction).toBe('none');
    expect(wheel().defaultPrevented).toBe(true);
    handle.setCameraMode('cinematic');
    expect(canvas.style.touchAction).toBe('');
    handle.setCameraMode('explore');
    handle.dispose();
    expect(wheel().defaultPrevented).toBe(false);
    expect(scene.disposeNavigation).toHaveBeenCalledOnce();
    handle.setViewPreset('top');
    expect(scene.navigation.state.preset).toBe('overview');
  });
});
