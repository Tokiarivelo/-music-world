/**
 * Aurora sky backdrop (northern-lights mode): three tall curtains of green, cyan and violet light hang above the plate.
 * The notes themselves are not drawn here any more: the staff view turns its five lines into aurora ribbons and keeps
 * its note glyphs, colored by pitch with the aurora colors. Redrawn only when the song time or the mode change, so a
 * paused song costs nothing. Nothing is shown unless `skyStore` is on.
 */
import { Group } from 'three';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { SKY_CURTAINS, SKY_CURTAIN_SPACING_GAPS, SKY_HEIGHT_GAPS, skyHeightFraction, skyPath, skyU } from '@/engine/sky';
import { staffPoint } from '@/engine/staff';
import type { WorldState } from '@/engine/world-state';
import { skyStore } from '../sky-store';
import { AURORA_COLORS, AURORA_GREENS, AURORA_TOPS } from './aurora-colors';
import { buildRingGeometry, createAuroraCurtain, NOTE_LIGHTS, type AuroraCurtain } from './aurora-curtain';
import type { WorldView } from './world-view';

export { AURORA_COLORS } from './aurora-colors';

export class SkyNotesView implements WorldView {
  readonly object = new Group();
  private readonly curtains: AuroraCurtain[] = [];
  private readonly unsubscribe: () => void;
  private lastT = Number.NaN;

  constructor(private readonly plan: SpawnPlan) {
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
    // The real thing fills the sky: three curtains all the way round the horizon, at different distances and heights,
    // with drifting patches of light between dark gaps. Plate units: the landscape reaches about 55 of them.
    const size = plan.template.terrain.size;
    const rings = [
      { radius: size * 3.4, bottom: size * 0.5, height: size * 1.5, bands: 3 },
      { radius: size * 4.2, bottom: size * 0.8, height: size * 2.1, bands: 4 },
      { radius: size * 5.0, bottom: size * 1.1, height: size * 2.6, bands: 5 },
    ];
    rings.forEach((r, i) => {
      const colors = { primary: AURORA_GREENS[i % AURORA_GREENS.length]!, accent: AURORA_COLORS[(i + 1) % AURORA_COLORS.length]!, secondary: AURORA_TOPS[i % AURORA_TOPS.length]! };
      const ring = createAuroraCurtain(path, colors, r.height / 0.22, 0.5, reduced, true, { geometry: buildRingGeometry(r.radius, r.bottom, r.height), bands: r.bands });
      this.curtains.push(ring);
      this.object.add(ring.mesh);
    });
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
    // The notes hang in the three curtains: each curtain glows around the notes that sit on it, at their own height.
    for (let i = 0; i < SKY_CURTAINS; i += 1) {
      const lights = state.skyNotes
        .filter((n) => n.curtain === i)
        .map((n) => {
          const r = this.plan.records[n.index]!;
          return { x: skyU(this.plan, r, state.t), y: skyHeightFraction(r.midi), strength: n.sounding ? 1 : n.glow * 0.7 };
        })
        .sort((a, b) => b.strength - a.strength)
        .slice(0, NOTE_LIGHTS);
      this.curtains[i]!.setNotes(lights);
    }
  }

  dispose(): void {
    this.unsubscribe();
    for (const c of this.curtains) c.dispose();
    this.object.removeFromParent();
  }
}
