import { describe, expect, it, vi } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { createMusicWorld, type WorldHostDeps } from './world-host';

function fakeDeps(withSession = false) {
  const worlds: Array<ReturnType<typeof makeWorld>> = [];
  const scene = { setScene: vi.fn() };
  function makeWorld(container: HTMLElement) {
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    return {
      launchXR: vi.fn(),
      exitXR: vi.fn(),
      destroy: vi.fn(),
      camera: { position: { set: vi.fn() }, lookAt: vi.fn(), fov: 50, updateProjectionMatrix: vi.fn() },
      session: withSession ? ({} as XRSession) : undefined,
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
    handle.dispose();
    handle.load({ analysis: demo, template: DEFAULT_TEMPLATE, seed: 1, clock });
    expect(scene.setScene).toHaveBeenCalledOnce();
  });
});
