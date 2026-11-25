/**
 * Aurora sky backdrop (northern-lights mode): three tall curtains of green, cyan and violet light hang above the plate.
 * The notes themselves are not drawn here any more: the staff view turns its five lines into aurora ribbons and keeps
 * its note glyphs, colored by pitch with the aurora colors. Redrawn only when the song time or the mode change, so a
 * paused song costs nothing. Nothing is shown unless `skyStore` is on.
 */
import { Group } from 'three';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { SKY_CURTAINS, SKY_CURTAIN_SPACING_GAPS, SKY_HEIGHT_GAPS, skyPath } from '@/engine/sky';
import { staffPoint } from '@/engine/staff';
import type { WorldState } from '@/engine/world-state';
import { skyStore } from '../sky-store';
import { AURORA_COLORS, AURORA_GREENS, AURORA_TOPS } from './aurora-colors';
import { createAuroraCurtain, type AuroraCurtain } from './aurora-curtain';
import type { WorldView } from './world-view';

export { AURORA_COLORS } from './aurora-colors';

export class SkyNotesView implements WorldView {
  readonly object = new Group();
  private readonly curtains: AuroraCurtain[] = [];
  private readonly unsubscribe: () => void;
  private lastT = Number.NaN;

  constructor(plan: SpawnPlan) {
    const path = skyPath(plan);
    const gap = path.lineGap;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Curtains: one ribbon per aurora color, shifted sideways so the three hang side by side like in the sky.
    const a = staffPoint(path, 0.45);
    const b = staffPoint(path, 0.55);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    for (let i = 0; i < SKY_CURTAINS; i += 1) {
      const next = AURORA_COLORS[(i + 1) % AURORA_COLORS.length]!;
      const curtain = createAuroraCurtain(path, { primary: AURORA_GREENS[i % AURORA_GREENS.length]!, accent: next, secondary: AURORA_TOPS[i % AURORA_TOPS.length]! }, gap * SKY_HEIGHT_GAPS / 0.22, 0.55, reduced, true);
      const side = (i - (SKY_CURTAINS - 1) / 2) * SKY_CURTAIN_SPACING_GAPS * gap;
      curtain.mesh.position.set(nx * side, 0, nz * side);
      this.curtains.push(curtain);
      this.object.add(curtain.mesh);
    }
    this.unsubscribe = skyStore.subscribe(() => {
      this.lastT = Number.NaN;
    });
    this.object.visible = false;
  }

  update(state: WorldState): void {
    const on = skyStore.enabled;
    this.object.visible = on;
    if (!on || state.t === this.lastT) return;
    this.lastT = state.t;
    for (const c of this.curtains) c.update(state.t);
  }

  dispose(): void {
    this.unsubscribe();
    for (const c of this.curtains) c.dispose();
    this.object.removeFromParent();
  }
}
