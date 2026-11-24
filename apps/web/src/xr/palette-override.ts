import type { SpawnPlan } from '@/engine/spawn-plan';
import type { WorldTemplate } from '@/engine/types';

/** A view-only color choice (I4): any subset of the six palette roles, applied on top of the template. */
export type PaletteOverride = Partial<WorldTemplate['palette']>;

/**
 * The plan with the override merged into its palette. Same plan object when there is nothing to change; otherwise a
 * shallow copy (notes, structures and the staff path are shared) so the template itself is never mutated and
 * `worldStateAt` sees the same events.
 */
export function applyPaletteOverride(plan: SpawnPlan, override: PaletteOverride | null): SpawnPlan {
  if (!override) return plan;
  const roles = Object.keys(override) as Array<keyof PaletteOverride>;
  if (roles.every((r) => override[r] === undefined || override[r] === plan.template.palette[r])) return plan;
  const palette = { ...plan.template.palette };
  for (const r of roles) if (override[r] !== undefined) palette[r] = override[r]!;
  return { ...plan, template: { ...plan.template, palette } };
}
