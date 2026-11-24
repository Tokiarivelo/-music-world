/**
 * IWSDK systems of the music world (03-world-engine-core tasks 4 and 5, requirement 5.2).
 *
 * One entity carries the `ClockComponent` (audio clock, spawn plan, current state, diorama root). `ClockSystem` runs
 * first each frame: it reads `t = clock.now()` once and stores `worldStateAt(plan, t)`. The view systems (terrain,
 * staff + notes, structures, fx) only read that state, so every layer shows the same instant and nothing depends on
 * frame deltas — pause and seek are exact.
 *
 * IWSDK 1.1.0 API checked against the installed typings: `createComponent(id, schema, description)`,
 * `createSystem(queries)`, `Types.Object`, `world.registerComponent`, `world.registerSystem(cls, { priority })`
 * (lower priority runs first), `entity.addComponent / getValue / setValue`, `system.cleanupFuncs`.
 */
import { createComponent, createSystem, Types, type Entity, type World } from '@iwsdk/core';
import { AmbientLight, Color, DirectionalLight, Group } from 'three';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt, type WorldState } from '@/engine/world-state';
import { anchorPlacement, cameraFar, rootScale, scaleStore, type ScaleMode } from '../scale';
import { EnvironmentView } from '../views/environment-view';
import { FxView } from '../views/fx-view';
import { StaffView } from '../views/staff-view';
import { StructureView } from '../views/structure-view';
import { TerrainView } from '../views/terrain-view';
import type { WorldView } from '../views/world-view';

/** The only time source of the world: `AudioClock.now()` from the player (tech.md rule 4). */
export interface WorldClock {
  now(): number;
  /** Present on the player's clock: the score player ("Play my edits") follows pauses and the playback rate. */
  isPlaying?(): boolean;
  rate?(): number;
}

export const ClockComponent = createComponent(
  'mw-clock',
  {
    clock: { type: Types.Object, default: null },
    plan: { type: Types.Object, default: null },
    state: { type: Types.Object, default: null },
    root: { type: Types.Object, default: null },
  },
  'Music World audio clock, spawn plan, current world state and diorama root',
);

const CLOCK_PRIORITY = -100;
const PERF_LOG_INTERVAL_SEC = 1;
const BASE_AMBIENT = 0.6;
const BASE_SUN = 1.2;
/** Light level bounds: brighter scenes cost fill rate on a Quest, so the top stays modest. */
export const MIN_LIGHT_LEVEL = 0.5;
export const MAX_LIGHT_LEVEL = 1.5;

function read<T>(entity: Entity, key: 'clock' | 'plan' | 'state' | 'root'): T | null {
  return (entity.getValue(ClockComponent, key) as T | null) ?? null;
}

export class ClockSystem extends createSystem({ clocks: { required: [ClockComponent] } }) {
  private lastPlan: SpawnPlan | null = null;

  update(): void {
    for (const entity of this.queries.clocks.entities) {
      const clock = read<WorldClock>(entity, 'clock');
      const plan = read<SpawnPlan>(entity, 'plan');
      if (!clock || !plan) continue;
      const t = clock.now();
      const state = read<WorldState>(entity, 'state');
      // Paused: same plan and t give the same state (worldStateAt is pure), so keep it and allocate nothing.
      if (state && state.t === t && this.lastPlan === plan) continue;
      this.lastPlan = plan;
      entity.setValue(ClockComponent, 'state', worldStateAt(plan, t));
    }
  }
}

/**
 * A system that (re)builds one view when the plan changes and feeds it the shared state every frame. The view is a
 * child of the diorama root unless `worldFixed`: then it is a child of the scene (the environment around the user).
 */
function viewSystem(build: (plan: SpawnPlan) => WorldView, worldFixed = false) {
  return class extends createSystem({ clocks: { required: [ClockComponent] } }) {
    private view: WorldView | null = null;
    private viewPlan: SpawnPlan | null = null;

    init(): void {
      this.cleanupFuncs.push(() => this.release());
    }

    private release(): void {
      this.view?.object.removeFromParent();
      if (worldFixed) this.world.scene.fog = null;
      this.view?.dispose();
      this.view = null;
      this.viewPlan = null;
    }

    update(): void {
      for (const entity of this.queries.clocks.entities) {
        const plan = read<SpawnPlan>(entity, 'plan');
        const state = read<WorldState>(entity, 'state');
        const root = read<Group>(entity, 'root');
        if (!plan || !state || !root) continue;
        if (plan !== this.viewPlan) {
          this.release();
          this.view = build(plan);
          this.viewPlan = plan;
          (worldFixed ? this.world.scene : root).add(this.view.object);
          if (worldFixed && this.view instanceof EnvironmentView) this.world.scene.fog = this.view.fog;
        }
        this.view?.update(state);
        return; // one music world per IWSDK world
      }
    }
  };
}

export const TerrainSystem = viewSystem((plan) => new TerrainView(plan));
export const StaffSystem = viewSystem((plan) => new StaffView(plan));
export const StructureSystem = viewSystem((plan) => new StructureView(plan));
export const FxSystem = viewSystem((plan) => new FxView(plan));
export const EnvironmentSystem = viewSystem((plan) => new EnvironmentView(plan), true);

/** Snapshot of `renderer.info` (04-default-template requirement 7.3). */
export interface PerfSample {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export function perfSample(info: {
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
}): PerfSample {
  return {
    calls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
}

/**
 * Diagnostic only (`?perf=1`): logs draw calls and triangles of the last rendered frame once per second. The interval
 * uses frame deltas because it schedules a log line, never a visual event.
 */
export class PerfSystem extends createSystem({}) {
  private elapsed = 0;

  update(delta: number): void {
    this.elapsed += delta;
    if (this.elapsed < PERF_LOG_INTERVAL_SEC) return;
    this.elapsed = 0;
    console.info(`[mw-perf] ${JSON.stringify(perfSample(this.renderer.info))}`);
  }
}

export interface MusicScene {
  /** The diorama group (plate centre at its origin, scaled to `DIORAMA_WIDTH_M`), child of `anchor`. */
  readonly root: Group;
  /** Unscaled transform of the diorama (position + yaw): moved by the VR tabletop placement (07-xr-mode). */
  readonly anchor: Group;
  readonly anchorEntity: Entity;
  setScene(plan: SpawnPlan, clock: WorldClock): void;
  /** Multiplies the scene lights (I4b); 1 = the template look. View-only. The renderer has no tone mapping, so no exposure. */
  setLightLevel(level: number): void;
  /** Table-top diorama or a world the viewer stands in (I7). View-only: the plan and the clock are untouched. */
  setScaleMode(mode: ScaleMode): void;
}

/** Registers the component and systems and creates the clock entity with the diorama root. */
export function installMusicSystems(world: World, options: { perfLog?: boolean } = {}): MusicScene {
  world.registerComponent(ClockComponent);
  world.registerSystem(ClockSystem, { priority: CLOCK_PRIORITY });
  world.registerSystem(TerrainSystem);
  world.registerSystem(StaffSystem);
  world.registerSystem(StructureSystem);
  world.registerSystem(FxSystem);
  world.registerSystem(EnvironmentSystem);
  // The sky dome is far away: the default far plane would clip it.
  const applyFar = (mode: ScaleMode) => {
    world.camera.far = cameraFar(mode);
    world.camera.updateProjectionMatrix();
  };
  applyFar(scaleStore.mode);
  if (options.perfLog) world.registerSystem(PerfSystem);

  const anchor = new Group();
  anchor.name = 'music-world-anchor';
  const place = anchorPlacement(scaleStore.mode);
  anchor.position.set(place.x, place.y, place.z);
  let terrainSize = 12;
  const applyScale = () => root.scale.setScalar(rootScale(scaleStore.mode, terrainSize));
  const root = new Group();
  root.name = 'music-world';
  const ambient = new AmbientLight(0xffffff, BASE_AMBIENT);
  root.add(ambient);
  const sun = new DirectionalLight(0xc9b8ff, BASE_SUN);
  sun.position.set(-4, 10, 6);
  root.add(sun);
  anchor.add(root);
  scaleStore.subscribe((mode) => {
    applyFar(mode);
    applyScale();
    const at = anchorPlacement(mode);
    anchor.position.set(at.x, at.y, at.z);
    anchor.rotation.set(0, 0, 0);
  });
  const entity = world.createTransformEntity(anchor);
  entity.addComponent(ClockComponent, { root });

  return {
    root,
    anchor,
    anchorEntity: entity,
    setScaleMode(mode) {
      scaleStore.set(mode); // the subscription below does the work, so a mode set from VR input does the same
    },
    setLightLevel(level) {
      const k = Number.isFinite(level) ? Math.min(MAX_LIGHT_LEVEL, Math.max(MIN_LIGHT_LEVEL, level)) : 1;
      ambient.intensity = BASE_AMBIENT * k;
      sun.intensity = BASE_SUN * k;
    },
    setScene(plan, clock) {
      terrainSize = plan.template.terrain.size;
      applyScale();
      world.scene.background = new Color(plan.template.palette.background);
      entity.setValue(ClockComponent, 'clock', clock);
      entity.setValue(ClockComponent, 'plan', plan);
      entity.setValue(ClockComponent, 'state', worldStateAt(plan, clock.now()));
    },
  };
}
