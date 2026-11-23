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
import { DIORAMA_POSITION, DIORAMA_WIDTH_M } from '../constants';
import { FxView } from '../views/fx-view';
import { StaffView } from '../views/staff-view';
import { StructureView } from '../views/structure-view';
import { TerrainView } from '../views/terrain-view';
import type { WorldView } from '../views/world-view';

/** The only time source of the world: `AudioClock.now()` from the player (tech.md rule 4). */
export interface WorldClock {
  now(): number;
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

function read<T>(entity: Entity, key: 'clock' | 'plan' | 'state' | 'root'): T | null {
  return (entity.getValue(ClockComponent, key) as T | null) ?? null;
}

export class ClockSystem extends createSystem({ clocks: { required: [ClockComponent] } }) {
  update(): void {
    for (const entity of this.queries.clocks.entities) {
      const clock = read<WorldClock>(entity, 'clock');
      const plan = read<SpawnPlan>(entity, 'plan');
      if (!clock || !plan) continue;
      entity.setValue(ClockComponent, 'state', worldStateAt(plan, clock.now()));
    }
  }
}

/** A system that (re)builds one view when the plan changes and feeds it the shared state every frame. */
function viewSystem(build: (plan: SpawnPlan) => WorldView) {
  return class extends createSystem({ clocks: { required: [ClockComponent] } }) {
    private view: WorldView | null = null;
    private viewPlan: SpawnPlan | null = null;

    init(): void {
      this.cleanupFuncs.push(() => this.release());
    }

    private release(): void {
      this.view?.object.removeFromParent();
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
          root.add(this.view.object);
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
  /** The diorama group (plate centre at its origin), placed at table height in front of the user. */
  readonly root: Group;
  setScene(plan: SpawnPlan, clock: WorldClock): void;
}

/** Registers the component and systems and creates the clock entity with the diorama root. */
export function installMusicSystems(world: World, options: { perfLog?: boolean } = {}): MusicScene {
  world.registerComponent(ClockComponent);
  world.registerSystem(ClockSystem, { priority: CLOCK_PRIORITY });
  world.registerSystem(TerrainSystem);
  world.registerSystem(StaffSystem);
  world.registerSystem(StructureSystem);
  world.registerSystem(FxSystem);
  if (options.perfLog) world.registerSystem(PerfSystem);

  const root = new Group();
  root.name = 'music-world';
  root.position.set(DIORAMA_POSITION.x, DIORAMA_POSITION.y, DIORAMA_POSITION.z);
  root.add(new AmbientLight(0xffffff, 0.6));
  const sun = new DirectionalLight(0xc9b8ff, 1.2);
  sun.position.set(-4, 10, 6);
  root.add(sun);
  const entity = world.createTransformEntity(root);
  entity.addComponent(ClockComponent, { root });

  return {
    root,
    setScene(plan, clock) {
      root.scale.setScalar(DIORAMA_WIDTH_M / plan.template.terrain.size);
      world.scene.background = new Color(plan.template.palette.background);
      entity.setValue(ClockComponent, 'clock', clock);
      entity.setValue(ClockComponent, 'plan', plan);
      entity.setValue(ClockComponent, 'state', worldStateAt(plan, clock.now()));
    },
  };
}
