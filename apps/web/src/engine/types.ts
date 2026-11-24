/**
 * Engine input and output types. The engine is framework-free (no three, React, IWSDK, DOM).
 *
 * `EngineAnalysis` is the subset of the generated `music-world.analysis.v1` type (`Analysis`) the engine reads, so a
 * full analysis from the API can be passed as is.
 */
import type { Analysis, Template } from '@/templates/generated';

export type WorldTemplate = Template;
export type MappingRule = WorldTemplate['mappings'][number];
export type ShapeKind = MappingRule['spawn'];
export type ColorRole = NonNullable<MappingRule['colorRole']>;
/** A role that names a palette color; `line` takes the color of the note's voice line instead (I9). */
export type PaletteRole = Exclude<ColorRole, 'line'>;
export type Stem = Analysis['notes'][number]['stem'];
export type GlyphKind = 'quarter' | 'eighth' | 'sixteenth';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A detected note (`NoteEvent` in PROJECT.md §9), as produced by the analysis worker. */
export type NoteEvent = Readonly<Analysis['notes'][number]>;

export type ChordEvent = Readonly<Analysis['chords'][number]>;

export type LyricSegment = Readonly<Analysis['lyrics'][number]>;

export type EngineAnalysis = Readonly<
  Pick<Analysis, 'durationSec' | 'tempoBpm' | 'beats' | 'notes' | 'chords' | 'energy'> &
    Partial<Pick<Analysis, 'lyrics' | 'lyricsSource'>>
>;
