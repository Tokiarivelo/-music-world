import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeTemplate, noteArb, STEMS } from './__fixtures__/templates';
import { FALLBACK_KIND } from './constants';
import { inRange, mapNote, parseRange, TemplateRangeError } from './mapping';

describe('parseRange', () => {
  it('parses strict and inclusive ranges', () => {
    expect(parseRange('<48')).toEqual({ min: -Infinity, max: 48, minInclusive: false, maxInclusive: false });
    expect(parseRange('>72')).toEqual({ min: 72, max: Infinity, minInclusive: false, maxInclusive: false });
    expect(parseRange('48-72')).toEqual({ min: 48, max: 72, minInclusive: true, maxInclusive: true });
    expect(parseRange('0.7-0.2')).toEqual({ min: 0.2, max: 0.7, minInclusive: true, maxInclusive: true });
  });

  it('rejects anything else with a typed error', () => {
    for (const bad of ['', '48', '=48', '<', '1-', 'a-b', '<48 ', '48--72']) {
      expect(() => parseRange(bad)).toThrow(TemplateRangeError);
    }
  });

  it('`<k` and `>k` exclude k; `a-b` includes both bounds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 127 }), fc.integer({ min: 0, max: 127 }), (k, m) => {
        expect(inRange(m, parseRange(`<${k}`))).toBe(m < k);
        expect(inRange(m, parseRange(`>${k}`))).toBe(m > k);
        const lo = Math.min(k, m);
        const hi = Math.max(k, m);
        expect(inRange(lo, parseRange(`${lo}-${hi}`))).toBe(true);
        expect(inRange(hi, parseRange(`${hi}-${lo}`))).toBe(true);
      }),
    );
  });
});

describe('mapNote (requirement 1.2)', () => {
  it('the first matching rule wins, whatever follows', () => {
    const tpl = makeTemplate({
      mappings: [
        { when: {}, spawn: 'spike' },
        { when: {}, spawn: 'building' },
      ],
    });
    fc.assert(
      fc.property(noteArb(), (note) => {
        expect(mapNote(note, tpl)).toMatchObject({ kind: 'spike', ruleIndex: 0 });
      }),
    );
  });

  it('a pitch threshold partitions notes between consecutive rules', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 127 }), noteArb(), (k, note) => {
        const tpl = makeTemplate({
          mappings: [
            { when: { pitch: `<${k}` }, spawn: 'terrain_ridge' },
            { when: { pitch: `${k}-127` }, spawn: 'spike' },
          ],
        });
        expect(mapNote(note, tpl).kind).toBe(note.midi < k ? 'terrain_ridge' : 'spike');
      }),
    );
  });

  it('conditions combine with AND; a later rule catches what an earlier one rejects', () => {
    const tpl = makeTemplate({
      mappings: [
        { when: { chord: true, stem: 'other', velocity: '>0.5' }, spawn: 'cluster', colorRole: 'accent' },
        { when: { stem: 'vocals' }, spawn: 'crystal' },
        { when: { chord: false }, spawn: 'recipe:tower' },
      ],
    });
    fc.assert(
      fc.property(noteArb(), (note) => {
        const isCluster = note.chordId !== null && note.stem === 'other' && note.velocity > 0.5;
        const expected = isCluster
          ? 'cluster'
          : note.stem === 'vocals'
            ? 'crystal'
            : note.chordId === null
              ? 'recipe:tower'
              : FALLBACK_KIND;
        const mapped = mapNote(note, tpl);
        expect(mapped.kind).toBe(expected);
        expect(mapped.colorRole).toBe(isCluster ? 'accent' : null);
        expect(mapped.ruleIndex).toBe(['cluster', 'crystal', 'recipe:tower'].indexOf(expected));
      }),
    );
  });

  it('every stem value can be selected', () => {
    for (const stem of STEMS) {
      const tpl = makeTemplate({ mappings: [{ when: { stem }, spawn: 'spike' }] });
      const note = { id: 'n_0', time: 0, duration: 1, midi: 60, velocity: 0.5, stem, chordId: null };
      expect(mapNote(note, tpl).kind).toBe('spike');
      expect(mapNote({ ...note, stem: stem === 'bass' ? 'drums' : 'bass' }, tpl).kind).toBe(FALLBACK_KIND);
    }
  });

  it('exposes the rule pitch range and height source, and never mutates its inputs', () => {
    const tpl = Object.freeze(
      makeTemplate({ mappings: [{ when: { pitch: '48-72' }, spawn: 'building', heightFrom: 'duration' }] }),
    );
    const note = Object.freeze({ id: 'n_1', time: 1, duration: 1, midi: 60, velocity: 1, stem: 'other', chordId: null });
    const before = JSON.stringify([tpl, note]);
    expect(mapNote(note, tpl)).toEqual({
      kind: 'building',
      ruleIndex: 0,
      heightFrom: 'duration',
      colorRole: null,
      pitchRange: { min: 48, max: 72, minInclusive: true, maxInclusive: true },
    });
    expect(JSON.stringify([tpl, note])).toBe(before);
  });
});
