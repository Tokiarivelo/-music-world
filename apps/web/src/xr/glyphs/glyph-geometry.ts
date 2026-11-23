/**
 * Bravura glyphs as flat geometry (04-default-template requirement 4.1): the outlines extracted from the font
 * (`bravura-outlines.ts`) are triangulated once into `ShapeGeometry`, so glyphs stay sharp at any distance in VR and
 * render as one InstancedMesh per glyph kind. Units: staff spaces, y up.
 */
import { BufferGeometry, ShapeGeometry, ShapePath } from 'three';
import type { GlyphKind } from '@/engine/types';
import { BRAVURA_OUTLINES, type BravuraGlyphName } from './bravura-outlines';

/** Segments per Bézier curve: enough for a smooth outline at diorama scale, small for the triangle budget. */
export const GLYPH_CURVE_SEGMENTS = 3;

export const NOTE_GLYPH: Readonly<Record<GlyphKind, BravuraGlyphName>> = {
  quarter: 'noteQuarterUp',
  eighth: 'noteEighthUp',
  sixteenth: 'note16thUp',
};

/** Notehead width of the SMuFL note glyphs (noteheadBlack advance), in staff spaces. */
export const NOTEHEAD_WIDTH = 1.18;

const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

/** Parses the generated M / L / Q / C / Z path into a three.js ShapePath. */
export function parseGlyphPath(path: string): ShapePath {
  const shape = new ShapePath();
  const tokens = path.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i++]!;
    const arity = ARITY[op];
    if (arity === undefined) throw new Error(`glyph path: unknown command ${op}`);
    if (arity === 0) continue; // Z: ShapePath closes sub-paths itself
    do {
      const n = tokens.slice(i, i + arity).map(Number);
      if (n.length < arity || n.some((v) => !Number.isFinite(v))) throw new Error(`glyph path: bad ${op} arguments`);
      i += arity;
      if (op === 'M') shape.moveTo(n[0]!, n[1]!);
      else if (op === 'L') shape.lineTo(n[0]!, n[1]!);
      else if (op === 'Q') shape.quadraticCurveTo(n[0]!, n[1]!, n[2]!, n[3]!);
      else shape.bezierCurveTo(n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!);
    } while (i < tokens.length && ARITY[tokens[i]!] === undefined);
  }
  return shape;
}

/** Flat, triangulated glyph in staff spaces (font origin kept). */
export function bravuraGeometry(name: BravuraGlyphName): BufferGeometry {
  const shapes = parseGlyphPath(BRAVURA_OUTLINES[name].path).toShapes();
  return new ShapeGeometry(shapes, GLYPH_CURVE_SEGMENTS);
}

/** Note glyph with the notehead centred on the origin (stem up on the right). */
export function noteGlyphGeometry(kind: GlyphKind): BufferGeometry {
  return bravuraGeometry(NOTE_GLYPH[kind]).translate(-NOTEHEAD_WIDTH / 2, 0, 0);
}
