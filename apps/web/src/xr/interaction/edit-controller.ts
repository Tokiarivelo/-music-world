/**
 * Note edit controller (I9 requirements 1–3): hover, click-to-play and drag between lines and spaces, only while the
 * song is paused (the host enables it). Framework-free: the DOM and three.js are behind the deps, so a fake clock,
 * projector and synth drive the tests. States: idle → pressed → dragging → committed (back to idle).
 */
import { foldMidi, snapToStaff, stepPitch, stepsBetween } from '@/engine/edits';
import type { HiddenLayers } from '@/engine/layers';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { staffNotePosition } from '@/engine/staff';
import type { Vec3 } from '@/engine/types';
import { worldStateAt, type WorldState } from '@/engine/world-state';
import { editStore } from '../edit-store';
import { skyStore } from '../sky-store';
import { pickAtRay, pickAtScreen, pickables, type Pickable, type Projector, type ScreenPoint } from '../picking';

export interface NoteMove {
  readonly noteId: string;
  readonly midi: number;
}

export type NoteEditEvent =
  | { type: 'hover'; noteId: string | null }
  /** The selection changed; `primary` is the last selected note (null when the selection is empty). */
  | { type: 'selection'; ids: readonly string[]; primary: NoteMove | null }
  | { type: 'moved'; noteId: string; midi: number }
  /** One or several notes moved together (a drag or a keyboard step applies to the whole selection). */
  | { type: 'committed'; moves: readonly NoteMove[] }
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

/** A controller or hand ray in plan coordinates (metres of the plate); `dir` is normalized. */
export interface PlanRay {
  readonly origin: Vec3;
  readonly dir: Vec3;
}

export class EditController {
  private enabled = false;
  private mode: Mode = 'idle';
  private active: string | null = null;
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

  /** `additive` (Shift): toggle the note in the selection and do not start a drag. */
  pointerDown(p: ScreenPoint, additive = false): boolean {
    if (!this.enabled) return false;
    const index = this.pick(p);
    const plan = this.deps.plan();
    if (index === null || !plan) {
      if (!additive && editStore.state.selection.length > 0) this.setSelection([]);
      return false;
    }
    this.down = p;
    return this.press(plan.records[index]!, additive);
  }

  /** A press on a note, from the pointer or a ray: plays it, selects it, and arms a drag unless additive. */
  private press(r: { noteId: string; midi: number; velocity: number }, additive: boolean): boolean {
    this.deps.synth.playNote(r.midi, r.velocity);
    const current = editStore.state.selection;
    if (additive) {
      this.setSelection(current.includes(r.noteId) ? current.filter((id) => id !== r.noteId) : [...current, r.noteId]);
      editStore.set({ hover: r.noteId });
      return true;
    }
    this.mode = 'pressed';
    this.active = r.noteId;
    this.ghostMidi = null;
    // Pressing a selected note keeps the group (it can be dragged together); otherwise it becomes the selection.
    this.setSelection(current.includes(r.noteId) ? [...current.filter((id) => id !== r.noteId), r.noteId] : [r.noteId]);
    editStore.set({ hover: r.noteId });
    return true;
  }

  private setHover(noteId: string | null): void {
    if (noteId === editStore.state.hover) return;
    editStore.set({ hover: noteId });
    this.deps.emit({ type: 'hover', noteId });
  }

  private showGhost(midi: number): void {
    if (midi === this.ghostMidi || this.active === null) return;
    this.ghostMidi = midi;
    editStore.set({ ghost: { noteId: this.active, midi } });
    this.deps.emit({ type: 'moved', noteId: this.active, midi });
  }

  /** VR: the trigger went down on the ray (additive = the other hand's modifier; unused for now). Returns true when a note was hit. */
  rayDown(ray: PlanRay, additive = false): boolean {
    if (!this.enabled) return false;
    const f = this.frameItems();
    const index = f ? pickAtRay(f.items, ray.origin, ray.dir) : null;
    const plan = this.deps.plan();
    if (index === null || !plan) {
      if (!additive && editStore.state.selection.length > 0) this.setSelection([]);
      return false;
    }
    return this.press(plan.records[index]!, additive);
  }

  /** VR: the ray moved (hover while idle, pitch drag while the trigger is held). */
  rayMove(ray: PlanRay): void {
    if (!this.enabled) return;
    if (this.mode === 'idle') {
      const f = this.frameItems();
      const plan = this.deps.plan();
      const index = f ? pickAtRay(f.items, ray.origin, ray.dir) : null;
      this.setHover(index === null || !plan ? null : plan.records[index]!.noteId);
      return;
    }
    const midi = this.midiAtRay(ray);
    if (midi === null || this.active === null) return;
    const r = this.record(this.active);
    if (!r) return;
    if (this.mode === 'pressed' && midi === foldMidi(r.midi)) return; // the ray has not left the note's own place
    this.mode = 'dragging';
    this.showGhost(midi);
  }

  rayUp(): void {
    this.pointerUp();
  }

  pointerMove(p: ScreenPoint): void {
    if (!this.enabled) return;
    if (this.mode === 'idle') {
      const index = this.pick(p);
      const plan = this.deps.plan();
      const noteId = index === null || !plan ? null : plan.records[index]!.noteId;
      if (noteId !== editStore.state.hover) {
        editStore.set({ hover: noteId });
        this.deps.emit({ type: 'hover', noteId });
      }
      return;
    }
    if (this.mode === 'pressed' && Math.hypot(p.x - this.down.x, p.y - this.down.y) < DRAG_THRESHOLD_PX) return;
    this.mode = 'dragging';
    const midi = this.midiAt(p);
    if (midi !== null) this.showGhost(midi);
  }

  pointerUp(): void {
    if (this.mode === 'dragging' && this.active !== null && this.ghostMidi !== null) {
      const r = this.record(this.active);
      if (r && this.ghostMidi !== foldMidi(r.midi)) {
        this.deps.synth.playNote(this.ghostMidi, r.velocity);
        this.commitSteps(stepsBetween(foldMidi(r.midi), this.ghostMidi), this.active);
      }
    }
    this.abort();
  }

  /** Esc: drop the drag, keep the selection. */
  cancel(): void {
    if (this.mode === 'dragging') this.deps.emit({ type: 'cancelled' });
    this.abort();
  }

  /** Keyboard: move the selection by diatonic steps (requirement 11) and play the primary note. */
  nudge(steps: number): void {
    if (!this.enabled) return;
    const primary = editStore.primary;
    const r = primary ? this.record(primary) : undefined;
    if (!r) return;
    this.deps.synth.playNote(stepPitch(r.midi, steps), r.velocity);
    this.commitSteps(steps, primary!);
  }

  /** Keyboard: Enter plays the primary selected note. */
  playSelected(): void {
    const primary = editStore.primary;
    const r = primary ? this.record(primary) : undefined;
    if (r) this.deps.synth.playNote(r.midi, r.velocity);
  }

  /** Keyboard: Tab / arrows select the previous or next pickable note, in time order. */
  selectRelative(direction: 1 | -1): void {
    const items = this.frameItems()?.items;
    const plan = this.deps.plan();
    if (!this.enabled || !items || items.length === 0 || !plan) return;
    const sorted = [...items].sort((a, b) => a.index - b.index);
    const cur = editStore.primary;
    const pos = cur === null ? -1 : sorted.findIndex((i) => plan.records[i.index]!.noteId === cur);
    const r = plan.records[sorted[(pos + direction + sorted.length) % sorted.length]!.index]!;
    this.setSelection([r.noteId]);
  }

  private record(noteId: string) {
    const plan = this.deps.plan();
    return plan?.records.find((r) => r.noteId === noteId);
  }

  private setSelection(ids: readonly string[]): void {
    editStore.set({ selection: ids });
    const last = ids.at(-1);
    const r = last ? this.record(last) : undefined;
    this.deps.emit({ type: 'selection', ids, primary: r ? { noteId: r.noteId, midi: r.midi } : null });
  }

  /** The same diatonic steps for every selected note (the primary included). */
  private commitSteps(steps: number, primary: string): void {
    const ids = editStore.state.selection.includes(primary) ? editStore.state.selection : [primary];
    const moves = ids.flatMap((id): NoteMove[] => {
      const r = this.record(id);
      return r ? [{ noteId: id, midi: stepPitch(r.midi, steps) }] : [];
    });
    if (moves.length > 0 && steps !== 0) this.deps.emit({ type: 'committed', moves });
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
      this.frame = { plan, t, state, items: pickables(state, plan, this.deps.hidden(), skyStore.enabled) };
    }
    return this.frame;
  }

  private pick(p: ScreenPoint): number | null {
    const f = this.frameItems();
    return f ? pickAtScreen(f.items, this.deps.project, p) : null;
  }

  /** Pitch under a VR ray: the ray's point at the note's distance, read along the staff's vertical axis. */
  private midiAtRay(ray: PlanRay): number | null {
    const f = this.frameItems();
    if (!f || this.active === null) return null;
    const r = f.plan.records.find((x) => x.noteId === this.active);
    if (!r) return null;
    const onStaff = f.state.notesOnStaff.find((n) => n.index === r.index);
    const u = onStaff ? onStaff.u : f.plan.staff.playheadU;
    const base = staffNotePosition(f.plan.staff, u, 0, r.lineY);
    const t = (base.x - ray.origin.x) * ray.dir.x + (base.y - ray.origin.y) * ray.dir.y + (base.z - ray.origin.z) * ray.dir.z;
    if (t <= 0) return null;
    const y = ray.origin.y + ray.dir.y * t;
    return snapToStaff((y - base.y) / (4 * f.plan.staff.lineGap));
  }

  /** Pitch under the pointer: its vertical position along the screen projection of the note's own staff. */
  private midiAt(p: ScreenPoint): number | null {
    const f = this.frameItems();
    if (!f || this.active === null) return null;
    const r = f.plan.records.find((x) => x.noteId === this.active);
    if (!r) return null;
    const onStaff = f.state.notesOnStaff.find((n) => n.index === r.index);
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
