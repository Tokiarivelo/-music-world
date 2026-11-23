# Design Document — 03 World Engine Core

## Overview

```text
AnalysisResult + WorldTemplate + seed
          │ buildSpawnPlan (once)
          ▼
SpawnPlan { records: SpawnRecord[] sorted by onset, groups, staff geometry, beats }
          │ worldStateAt(plan, t)  (every frame, pure)
          ▼
WorldState { notesOnStaff[], fallingNotes[], structures[], arcs[], pulses }
          │ IWSDK systems
          ▼
InstancedMesh updates (matrices, colors, emissive) ─► Three.js / WebXR
```

## Engine (`apps/web/src/engine`, framework-free)

```ts
type ShapeKind = 'terrain_ridge' | 'building' | 'spike' | 'crystal' | 'cluster' | `recipe:${string}`;

interface SpawnRecord {
  noteId: string; kind: ShapeKind; slot: number;      // instance slot within its kind
  onset: number; duration: number; velocity: number; midi: number;
  staffU: number;                                       // vertical position on staff (from midi)
  target: Vec3; height: number; colorRole: ColorRole;
}
interface SpawnPlan { records: SpawnRecord[]; groups: ChordGroup[]; kicks: number[]; staff: StaffPath; template: WorldTemplate }

function buildSpawnPlan(a: AnalysisResult, tpl: WorldTemplate, seed: number): SpawnPlan;
function worldStateAt(plan: SpawnPlan, t: number): WorldState;
```

- `prng.ts`: mulberry32; per-note stream = `mulberry32(hash(seed, noteId))` so results do not depend on iteration order.
- `mapping.ts`: evaluates template rules (`pitch` ranges, `chord`, `stem`, `velocity`) → `ShapeKind`.
- `layout.ts`: zones per kind (default: city zone on the left half of the plate; ridges on edges; spikes behind the city).
  Position = zone origin + pitch → x along the zone, PRNG jitter → z, collision avoided with a jittered grid.
- `worldStateAt`: binary search on `onset` for the visible window `[t - maxLife, t + lookahead]`; each entry's phase is
  derived from `t - onset` (`onStaff` / `falling` / `growing` / `alive`). No mutation of `plan`.
- Slot reuse when over budget: `slot = index % budget` (deterministic; the oldest slot is overwritten).

## Rendering (`apps/web/src/xr`)

- `StaffSystem`: builds 5 tube lines along `StaffPath` (CatmullRom curve) once; Bravura glyphs as SDF text instances.
- `NoteSystem`: updates glyph instances for `notesOnStaff` and `fallingNotes`.
- `StructureSystem`: one `InstancedMesh` per kind; scale.y = growth × height; emissive from velocity × palette role.
- `FxSystem`: arcs (instanced tubes), particles (Points), crack pulse uniform driven by `kicks`, bloom via post-processing.
- `TerrainSystem`: plate mesh with crack texture/emissive mask and edge mountains (noise heightfield, built once).
- All systems read `t = clock.now()` once per frame from a shared `ClockComponent`.

## Testing (fast-check)

- Determinism: `buildSpawnPlan(a, tpl, s)` deep-equals itself across runs; `worldStateAt(plan, t)` is idempotent.
- Seek equivalence: for random `t` sequences, `worldStateAt` results do not depend on call order.
- Monotonicity: spawned count is non-decreasing in `t`.
- Budget: instance count per kind ≤ budget for random analyses of up to 20 000 notes.
- Bounds: every target lies inside its zone.
