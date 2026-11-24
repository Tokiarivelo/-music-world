/**
 * Note edit controller (I9 requirements 1–3): hover, click-to-play and drag between lines and spaces, only while the
 * song is paused (the host enables it). Framework-free: the DOM and three.js are behind the deps, so a fake clock,
 * projector and synth drive the tests. States: idle → pressed → dragging → committed (back to idle).
 */
import { snapToStaff, stepPitch } from '@/engine/edits';
import type { HiddenLayers } from '@/engine/layers';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { staffNotePosition } from '@/engine/staff';
import type { Vec3 } from '@/engine/types';
import { worldStateAt, type WorldState } from '@/engine/world-state';
import { editStore } from '../edit-store';
import { pickAtScreen, pickables, type Pickable, type Projector, type ScreenPoint } from '../picking';

export type NoteEditEvent =
  | { type: 'hover'; noteId: string | null }
  | { type: 'selected'; noteId: string; midi: number }
  | { type: 'moved'; noteId: string; midi: number }
  | { type: 'committed'; noteId: string; midi: number }
  | { type: 'cancelled' };

export interface EditDeps {
  plan(): SpawnPlan | null;
  now(): number;
  hidden(): HiddenLayers;
  project: Projector;
  synth: { playNote(midi: number, velocity?: number): boolean };
  emit(event: NoteEditEvent): void;
}

/** Pixels the pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

type Mode = 'idle' | 'pressed' | 'dragging';

export class EditController {
  private enabled = false;
  private mode: Mode = 'idle';
  private active: number | null = null;
  private down: ScreenPoint = { x: 0, y: 0 };
  private ghostMidi: number | null = null;
  private frame: { plan: SpawnPlan; t: number; state: WorldState; items: Pickable[] } | null = null;

  constructor(private readonly deps: EditDeps) {}

  /** True while a press or drag owns the pointer: the camera navigation must not orbit. */
  get capturing(): boolean {
    return this.mode !== 'idle';
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) {
      this.abort();
      editStore.reset();
    } else {
      editStore.set({ enabled: true });
    }
  }

  pointerDown(p: ScreenPoint): boolean {
    if (!this.enabled) return false;
    const index = this.pick(p);
    if (index === null) {
      editStore.set({ selected: null });
      return false;
    }
    const plan = this.deps.plan()!;
    const r = plan.records[index]!;
    this.mode = 'pressed';
    this.active = index;
    this.down = p;
    this.ghostMidi = null;
    this.deps.synth.playNote(r.midi, r.velocity);
    editStore.set({ selected: index, hover: index });
    this.deps.emit({ type: 'selected', noteId: r.noteId, midi: r.midi });
    return true;
  }

  pointerMove(p: ScreenPoint): void {
    if (!this.enabled) return;
    if (this.mode === 'idle') {
      const index = this.pick(p);
      if (index !== editStore.state.hover) {
        editStore.set({ hover: index });
        const plan = this.deps.plan();
        this.deps.emit({ type: 'hover', noteId: index === null || !plan ? null : plan.records[index]!.noteId });
      }
      return;
    }
    if (this.mode === 'pressed' && Math.hypot(p.x - this.down.x, p.y - this.down.y) < DRAG_THRESHOLD_PX) return;
    this.mode = 'dragging';
    const midi = this.midiAt(p);
    if (midi === null || midi === this.ghostMidi || this.active === null) return;
    this.ghostMidi = midi;
    editStore.set({ ghost: { index: this.active, midi } });
    this.deps.emit({ type: 'moved', noteId: this.deps.plan()!.records[this.active]!.noteId, midi });
  }

  pointerUp(): void {
    if (this.mode === 'dragging' && this.active !== null && this.ghostMidi !== null) {
      const r = this.deps.plan()!.records[this.active]!;
      if (this.ghostMidi !== r.midi) {
        this.deps.synth.playNote(this.ghostMidi, r.velocity);
        this.deps.emit({ type: 'committed', noteId: r.noteId, midi: this.ghostMidi });
      }
    }
    this.abort();
  }

  /** Esc: drop the drag, keep the selection. */
  cancel(): void {
    if (this.mode === 'dragging') this.deps.emit({ type: 'cancelled' });
    this.abort();
  }

  /** Keyboard: move the selected note by diatonic steps (requirement 11) and play it. */
  nudge(steps: number): void {
    const plan = this.deps.plan();
    const sel = editStore.state.selected;
    if (!this.enabled || !plan || sel === null) return;
    const r = plan.records[sel];
    if (!r) return;
    const midi = stepPitch(r.midi, steps);
    this.deps.synth.playNote(midi, r.velocity);
    this.deps.emit({ type: 'committed', noteId: r.noteId, midi });
  }

  /** Keyboard: Enter plays the selected note. */
  playSelected(): void {
    const plan = this.deps.plan();
    const sel = editStore.state.selected;
    const r = plan && sel !== null ? plan.records[sel] : undefined;
    if (r) this.deps.synth.playNote(r.midi, r.velocity);
  }

  /** Keyboard: Tab / arrows select the previous or next pickable note, in time order. */
  selectRelative(direction: 1 | -1): void {
    const items = this.frameItems()?.items;
    if (!this.enabled || !items || items.length === 0) return;
    const sorted = [...items].sort((a, b) => a.index - b.index);
    const cur = editStore.state.selected;
    const pos = cur === null ? -1 : sorted.findIndex((i) => i.index === cur);
    const next = sorted[(pos + direction + sorted.length) % sorted.length]!;
    const r = this.deps.plan()!.records[next.index]!;
    editStore.set({ selected: next.index });
    this.deps.emit({ type: 'selected', noteId: r.noteId, midi: r.midi });
  }

  private abort(): void {
    this.mode = 'idle';
    this.active = null;
    this.ghostMidi = null;
    editStore.set({ ghost: null });
  }

  private frameItems(): { plan: SpawnPlan; state: WorldState; items: Pickable[] } | null {
    const plan = this.deps.plan();
    if (!plan) return null;
    const t = this.deps.now();
    if (this.frame?.plan !== plan || this.frame.t !== t) {
      const state = worldStateAt(plan, t);
      this.frame = { plan, t, state, items: pickables(state, plan, this.deps.hidden()) };
    }
    return this.frame;
  }

  private pick(p: ScreenPoint): number | null {
    const f = this.frameItems();
    return f ? pickAtScreen(f.items, this.deps.project, p) : null;
  }

  /** Pitch under the pointer: its vertical position along the screen projection of the note's own staff. */
  private midiAt(p: ScreenPoint): number | null {
    const f = this.frameItems();
    if (!f || this.active === null) return null;
    const r = f.plan.records[this.active]!;
    const onStaff = f.state.notesOnStaff.find((n) => n.index === this.active);
    const u = onStaff ? onStaff.u : f.plan.staff.playheadU;
    const at = (staffU: number): ScreenPoint | null => {
      const v: Vec3 = staffNotePosition(f.plan.staff, u, staffU, r.lineY);
      return this.deps.project(v);
    };
    const s0 = at(0);
    const s1 = at(1);
    if (!s0 || !s1) return null;
    const dx = s1.x - s0.x;
    const dy = s1.y - s0.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) return null;
    return snapToStaff(((p.x - s0.x) * dx + (p.y - s0.y) * dy) / len2);
  }
}
