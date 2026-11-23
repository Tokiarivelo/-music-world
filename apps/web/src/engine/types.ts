/**
 * Engine input and output types. The engine is framework-free (no three, React, IWSDK, DOM).
 *
 * `EngineAnalysis` is the subset of `music-world.analysis.v1` the engine reads; the generated `AnalysisResult` type
 * (02-music-analysis task 1) is structurally compatible with it.
 */
import type { Template } from '@/templates/generated';

export type WorldTemplate = Template;
export type MappingRule = WorldTemplate['mappings'][number];
export type ShapeKind = MappingRule['spawn'];
export type ColorRole = NonNullable<MappingRule['colorRole']>;
export type Stem = 'vocals' | 'drums' | 'bass' | 'other';
export type GlyphKind = 'quarter' | 'eighth' | 'sixteenth';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NoteEvent {
  readonly id: string;
  readonly time: number;
  readonly duration: number;
  readonly midi: number;
  readonly velocity: number;
  readonly stem: string;
  readonly chordId: string | null;
}

export interface ChordEvent {
  readonly id: string;
  readonly time: number;
  readonly duration: number;
  readonly label: string;
  readonly noteIds: readonly string[];
}

export interface EngineAnalysis {
  readonly durationSec: number;
  readonly tempoBpm: number;
  readonly beats: readonly number[];
  readonly notes: readonly NoteEvent[];
  readonly chords: readonly ChordEvent[];
  readonly energy: readonly { readonly time: number; readonly value: number }[];
}
