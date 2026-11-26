import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from './__fixtures__/demo-analysis';
import { analysisArb } from './__fixtures__/analyses';
import { makeTemplate, templateArb } from './__fixtures__/templates';
import { cityOf, isCityKind, templateHasCity, CONSTRUCTION_SEC, inLake } from './city';
import { zonesFor } from './layout';
import { mapNote } from './mapping';
import { foldMidi } from './edits';
import { buildSpawnPlan, glyphOf, staffUOf } from './spawn-plan';
import type { EngineAnalysis } from './types';

const DEMO: EngineAnalysis = demo;
const SPLIT = makeTemplate({
  mappings: [
    { when: { pitch: '<48' }, spawn: 'terrain_ridge' },
    { when: { pitch: '48-72' }, spawn: 'crystal' },
    { when: { pitch: '>72' }, spawn: 'spike' },
  ],
});
/** A city: its building notes are re-planned onto lots, gardens and roads. */
const CITY = makeTemplate({
  mappings: [
    { when: { pitch: '<48' }, spawn: 'terrain_ridge' },
    { when: { pitch: '48-72' }, spawn: 'building' },
    { when: { pitch: '>72' }, spawn: 'spike' },
  ],
});

describe('buildSpawnPlan on the demo fixture', () => {
  const plan = buildSpawnPlan(DEMO, SPLIT, 7);

  it('has one record per note, sorted by onset, with the kind of its first matching rule (req 1.1, 1.2)', () => {
    expect(plan.records).toHaveLength(DEMO.notes.length);
    expect(new Set(plan.records.map((r) => r.noteId))).toEqual(new Set(DEMO.notes.map((n) => n.id)));
    expect(plan.onsets).toEqual([...plan.onsets].sort((a, b) => a - b));
    const byId = new Map(DEMO.notes.map((n) => [n.id, n]));
    for (const r of plan.records) expect(r.kind).toBe(mapNote(byId.get(r.noteId)!, SPLIT).kind);
    expect(new Set(plan.records.map((r) => r.kind))).toEqual(new Set(['terrain_ridge', 'crystal', 'spike']));
  });

  it('groups every chord with its notes (req 1.3)', () => {
    expect(plan.groups.map((g) => g.id)).toEqual(DEMO.chords.map((c) => c.id));
    for (const g of plan.groups) {
      const chord = DEMO.chords.find((c) => c.id === g.id)!;
      expect(g.recordIndices.map((i) => plan.records[i]!.noteId).sort()).toEqual([...chord.noteIds].sort());
      expect(g.landAt).toBeCloseTo(chord.time + SPLIT.staff.fallDuration, 9);
    }
  });

  it('uses the beat grid as kicks when there is no drum stem', () => {
    expect(DEMO.notes.some((n) => n.stem === 'drums')).toBe(false);
    expect(plan.kicks).toEqual(DEMO.beats);
  });

  it('derives the phase timings of each record from the template (req 3.3, 3.5)', () => {
    for (const r of plan.records) {
      expect(r.landAt).toBeCloseTo(r.onset + 0.35, 9);
      expect(r.growSec).toBe(Math.max(0.2, r.duration));
    }
  });
});

describe('buildSpawnPlan properties', () => {
  it('maps each note to exactly one record placed in a zone of its kind (req 1.2, 1.4)', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 120 }), templateArb(), fc.integer(), (analysis, tpl, seed) => {
        const plan = buildSpawnPlan(analysis, tpl, seed);
        expect(plan.records.map((r) => r.noteId).sort()).toEqual(analysis.notes.map((n) => n.id).sort());
        for (const r of plan.records) {
          if (templateHasCity(tpl)) continue; // a city places objects on its lots and keeps the others off its roads, see below
          const zones = zonesFor(r.kind, tpl);
          expect(
            zones.some(
              (z) => r.target.x >= z.xMin && r.target.x <= z.xMax && r.target.z >= z.zMin && r.target.z <= z.zMax,
            ),
          ).toBe(true);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('assigns slots `indexWithinKind % budget` (req 1.5)', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 200 }), templateArb(), (analysis, tpl) => {
        const plan = buildSpawnPlan(analysis, tpl, 1);
        for (const track of plan.tracks) {
          track.recordIndices.forEach((recordIndex, k) => {
            const r = plan.records[recordIndex]!;
            expect(r.kind).toBe(track.kind);
            if (templateHasCity(tpl) && isCityKind(r.kind)) return; // a city object takes the slot of its spot
            expect(r.slot).toBe(k % tpl.budget.instancesPerKind);
          });
          expect(track.landTimes).toEqual([...track.landTimes].sort((a, b) => a - b));
        }
        expect(plan.tracks.reduce((n, t) => n + t.recordIndices.length, 0)).toBe(plan.records.length);
      }),
      { numRuns: 60 },
    );
  });

  it('links every chord to its member records; the arc waits for the last landing (req 1.3)', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 120 }), templateArb(), (analysis, tpl) => {
        const plan = buildSpawnPlan(analysis, tpl, 5);
        expect(plan.groups).toHaveLength(analysis.chords.length);
        for (const g of plan.groups) {
          const members = g.recordIndices.map((i) => plan.records[i]!);
          expect(members.map((r) => r.noteId).sort()).toEqual(
            [...analysis.chords.find((c) => c.id === g.id)!.noteIds].sort(),
          );
          expect(members.every((r) => r.groupId === g.id)).toBe(true);
          expect(g.landAt).toBe(Math.max(...members.map((r) => r.landAt)));
        }
      }),
      { numRuns: 60 },
    );
  });

  it('does not mutate the analysis or the template', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 60 }), templateArb(), (analysis, tpl) => {
        const before = JSON.stringify([analysis, tpl]);
        buildSpawnPlan(analysis, tpl, 3);
        expect(JSON.stringify([analysis, tpl])).toBe(before);
      }),
      { numRuns: 30 },
    );
  });
});

describe('note glyph and staff position', () => {
  it('picks quarter / eighth / sixteenth by duration in beats (req 3.4)', () => {
    expect(glyphOf(0.5, 120)).toBe('quarter');
    expect(glyphOf(0.25, 120)).toBe('eighth');
    expect(glyphOf(0.1, 120)).toBe('sixteenth');
  });

  it('places E4 on the bottom line and F5 on the top line, every note on a line or a space', () => {
    expect(staffUOf(64)).toBe(0);
    expect(staffUOf(77)).toBe(1);
    expect(staffUOf(71)).toBe(0.5); // B4, the middle line
    expect(staffUOf(65)).toBe(0.125); // F4, the first space
    expect(staffUOf(66)).toBe(0.125); // F♯4 shares the place of F4
  });

  it('folds notes outside the staff window by octaves instead of piling them up at its edge', () => {
    for (let midi = 0; midi <= 127; midi += 1) {
      const u = staffUOf(midi);
      expect(u).toBeGreaterThanOrEqual(-0.75);
      expect(u).toBeLessThanOrEqual(1.75);
      expect(foldMidi(midi) % 12).toBe(midi % 12); // the pitch class is kept
      if (midi >= 53 && midi <= 88) expect(foldMidi(midi)).toBe(midi); // inside the window nothing moves
    }
    expect(staffUOf(40)).toBe(staffUOf(64)); // E2 of a bass is drawn as E4: its pitch class is kept
    expect(new Set([28, 31, 33, 36].map(staffUOf)).size).toBe(4); // distinct bass pitches stay distinct
  });
});


describe('buildSpawnPlan in a city template (I39)', () => {
  const plan = buildSpawnPlan(DEMO, CITY, 7);
  const city = cityOf(CITY, 7);

  it('puts every building on a lot of the city plan, outside the lakes, with its yaw and variant', () => {
    const buildings = plan.records.filter((r) => r.kind === 'building');
    expect(buildings.length).toBeGreaterThan(0);
    const lots = new Set(city.lots.map((l) => `${l.x},${l.z}`));
    for (const r of buildings) {
      expect(lots.has(`${r.target.x},${r.target.z}`)).toBe(true);
      expect(inLake(city, r.target.x, r.target.z)).toBe(false);
    }
    expect(new Set(buildings.map((r) => r.variant)).size).toBeGreaterThan(1);
  });

  it('builds the town from the centre outwards as the song goes on', () => {
    const buildings = plan.records.filter((r) => r.kind === 'building');
    const mean = (rs: typeof buildings) => rs.reduce((n, r) => n + Math.hypot(r.target.x, r.target.z), 0) / rs.length;
    const third = Math.floor(buildings.length / 3);
    expect(mean(buildings.slice(0, third))).toBeLessThan(mean(buildings.slice(-third)));
  });

  it('builds a building for a building note only on a lot, takes the construction time, and never pre-fills cars', () => {
    for (const r of plan.records.filter((x) => x.kind === 'building')) expect(r.growSec).toBeGreaterThanOrEqual(CONSTRUCTION_SEC);
    expect(plan.sceneryCount).toBe(0);
    expect(new Set(plan.records.map((r) => r.kind)).size).toBeGreaterThan(2); // notes become trees, cars, buildings…
  });

  it('is deterministic', () => {
    expect(buildSpawnPlan(DEMO, CITY, 7).records.map((r) => r.target)).toEqual(plan.records.map((r) => r.target));
  });
});
