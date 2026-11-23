// Hand-made AnalysisResult used by the engine before the real pipeline exists (roadmap 1.7).
// Checks the invariants of 02-music-analysis requirements 3.2, 3.4, 5.1, 5.2 and 7.2.
// The contract itself (types, ranges, enums) is checked by the generated zod schema; the cross-field invariants below
// are enforced by the pydantic validator on the API side and re-checked here (zod ignores pydantic validators).
import { describe, expect, it } from 'vitest';
import { AnalysisSchema } from '@/templates/generated';
import demo from './demo-analysis.json';

const inSong = (t: number) => t >= 0 && t <= demo.durationSec;

describe('demo-analysis fixture', () => {
  it('parses with the generated music-world.analysis.v1 zod schema', () => {
    const parsed = AnalysisSchema.safeParse(demo);
    expect(parsed.success).toBe(true);
    expect(AnalysisSchema.safeParse({ ...demo, notes: [{ ...demo.notes[0], stem: 'piano' }] }).success).toBe(false);
  });

  it('declares the v1 contract and the expected size', () => {
    expect(demo.schema).toBe('music-world.analysis.v1');
    expect(demo.notes.length).toBeGreaterThanOrEqual(50);
    expect(demo.chords).toHaveLength(8);
    expect(demo.lyricsSource).toBe('none');
  });

  it('has valid notes sorted by time then midi (req 3.2, 3.4)', () => {
    const ids = new Set(demo.notes.map((n) => n.id));
    expect(ids.size).toBe(demo.notes.length);
    for (const n of demo.notes) {
      expect(n.id).toMatch(/^n_\d{4}$/);
      expect(n.duration).toBeGreaterThan(0);
      expect(Number.isInteger(n.midi) && n.midi >= 0 && n.midi <= 127).toBe(true);
      expect(n.velocity >= 0 && n.velocity <= 1).toBe(true);
      expect(['vocals', 'drums', 'bass', 'other']).toContain(n.stem);
      expect(inSong(n.time) && inSong(n.time + n.duration)).toBe(true);
    }
    const order = demo.notes.map((n) => [n.time, n.midi] as const);
    const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(order).toEqual(sorted);
  });

  it('has chords whose notes exist, start together and span 3+ pitch classes (req 5.1, 5.2, 7.2)', () => {
    const byId = new Map(demo.notes.map((n) => [n.id, n]));
    for (const c of demo.chords) {
      expect(c.id).toMatch(/^c_\d+$/);
      expect(c.label).toMatch(/^([A-G][#b]?(m|7|maj7|m7|dim|aug|sus[24])?|N\.C\.)$/);
      const members = c.noteIds.map((id) => byId.get(id));
      expect(members.every(Boolean)).toBe(true);
      expect(new Set(members.map((n) => n!.midi % 12)).size).toBeGreaterThanOrEqual(3);
      expect(members.every((n) => Math.abs(n!.time - c.time) <= 0.06 && n!.chordId === c.id)).toBe(true);
      expect(inSong(c.time) && inSong(c.time + c.duration)).toBe(true);
    }
  });

  it('has beats, energy, sections and lyrics inside the song; sections contiguous and covering (req 7.2)', () => {
    expect(demo.beats.every(inSong)).toBe(true);
    expect(demo.beats).toEqual([...demo.beats].sort((a, b) => a - b));
    expect(demo.energy.every((e) => inSong(e.time) && e.value >= 0 && e.value <= 1)).toBe(true);
    expect(demo.sections[0]?.start).toBe(0);
    expect(demo.sections.at(-1)?.end).toBe(demo.durationSec);
    demo.sections.slice(1).forEach((s, i) => expect(s.start).toBe(demo.sections[i]!.end));
    expect(demo.lyrics).toEqual([]);
  });
});
