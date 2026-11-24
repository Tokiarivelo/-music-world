/**
 * Note → shape kind, from the template's `mappings` (requirement 1.2): rules are evaluated in order and the first
 * rule whose every present condition matches wins. A note no rule matches uses {@link FALLBACK_KIND}.
 */
import { FALLBACK_KIND } from './constants';
import type { ColorRole, MappingRule, NoteEvent, ShapeKind, WorldTemplate } from './types';

/** Closed numeric interval; open template ranges (`<48`, `>72`) become strict bounds. */
export interface NumericRange {
  readonly min: number;
  readonly max: number;
  readonly minInclusive: boolean;
  readonly maxInclusive: boolean;
}

export class TemplateRangeError extends Error {
  constructor(readonly range: string) {
    super(`invalid range in template mapping: ${JSON.stringify(range)}`);
    this.name = 'TemplateRangeError';
  }
}

const RANGE_RE = /^(?:([<>])(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?))$/;

/** Parses `<a`, `>a` (strict) or `a-b` (inclusive, bounds may be given in either order). */
export function parseRange(text: string): NumericRange {
  const m = RANGE_RE.exec(text);
  if (!m) throw new TemplateRangeError(text);
  const [, op, bound, lo, hi] = m;
  if (op !== undefined && bound !== undefined) {
    const value = Number(bound);
    return op === '<'
      ? { min: -Infinity, max: value, minInclusive: false, maxInclusive: false }
      : { min: value, max: Infinity, minInclusive: false, maxInclusive: false };
  }
  const a = Number(lo);
  const b = Number(hi);
  return { min: Math.min(a, b), max: Math.max(a, b), minInclusive: true, maxInclusive: true };
}

export function inRange(value: number, r: NumericRange): boolean {
  const aboveMin = r.minInclusive ? value >= r.min : value > r.min;
  const belowMax = r.maxInclusive ? value <= r.max : value < r.max;
  return aboveMin && belowMax;
}

export function ruleMatches(rule: MappingRule, note: NoteEvent, line = 'main'): boolean {
  const w = rule.when;
  if (w.pitch != null && !inRange(note.midi, parseRange(w.pitch))) return false;
  if (w.velocity != null && !inRange(note.velocity, parseRange(w.velocity))) return false;
  if (w.chord != null && w.chord !== (note.chordId !== null)) return false;
  if (w.stem != null && w.stem !== note.stem) return false;
  if (w.line != null && w.line !== line) return false;
  return true;
}

export interface MappedNote {
  readonly kind: ShapeKind;
  /** Index of the matching rule, or -1 when the fallback kind was used. */
  readonly ruleIndex: number;
  readonly heightFrom: MappingRule['heightFrom'];
  readonly colorRole: ColorRole | null;
  /** Pitch range of the matching rule (for layout and color gradient), or null when it has none. */
  readonly pitchRange: NumericRange | null;
}

export function mapNote(note: NoteEvent, template: WorldTemplate, line = 'main'): MappedNote {
  const index = template.mappings.findIndex((rule) => ruleMatches(rule, note, line));
  const rule = template.mappings[index];
  if (rule === undefined) {
    return { kind: FALLBACK_KIND, ruleIndex: -1, heightFrom: 'velocity', colorRole: null, pitchRange: null };
  }
  return {
    kind: rule.spawn,
    ruleIndex: index,
    heightFrom: rule.heightFrom,
    colorRole: rule.colorRole,
    pitchRange: rule.when.pitch != null ? parseRange(rule.when.pitch) : null,
  };
}
