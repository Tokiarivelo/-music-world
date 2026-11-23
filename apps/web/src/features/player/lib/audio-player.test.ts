import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AudioPlayer, MAX_RATE, MIN_RATE } from './audio-player';
import { FakeAudioContext } from './fake-audio-context';

const EPS = 1e-6;
const DURATION = 180;

function setup(duration = DURATION) {
  const ctx = new FakeAudioContext();
  return { ctx, player: new AudioPlayer(ctx, { duration }) };
}

describe('AudioPlayer', () => {
  it('advances with the audio context while playing and freezes while paused (req 3.1, 3.2)', () => {
    const { ctx, player } = setup();
    player.play();
    ctx.advance(2);
    expect(player.now()).toBeCloseTo(2, 9);
    player.pause();
    ctx.advance(10);
    expect(player.now()).toBeCloseTo(2, 9);
    expect(player.isPlaying()).toBe(false);
  });

  it('returns the sought time immediately and restarts the source there (req 3.3)', () => {
    const { ctx, player } = setup();
    player.play();
    ctx.advance(1);
    player.seek(42.5);
    expect(player.now()).toBe(42.5);
    expect(ctx.sources.at(-1)?.started).toEqual([0, 42.5]);
    expect(ctx.sources[0]?.stopped).toBe(true);
  });

  it('advances at the playback rate (req 3.4)', () => {
    const { ctx, player } = setup();
    player.play();
    ctx.advance(1);
    player.setRate(2);
    ctx.advance(1);
    expect(player.now()).toBeCloseTo(3, 9);
    expect(ctx.sources.at(-1)?.playbackRate.value).toBe(2);
  });

  it('stops, clamps to duration and restarts from 0 at the end (req 3.5)', () => {
    const { ctx, player } = setup(10);
    expect(player.duration()).toBe(10);
    player.play();
    ctx.advance(25);
    expect(player.now()).toBe(10);
    expect(player.isPlaying()).toBe(false);
    player.play();
    expect(player.now()).toBe(0);
    player.stop();
    expect(player.now()).toBe(0);
    expect(player.isPlaying()).toBe(false);
  });

  it('rejects invalid rates and times', () => {
    const { player } = setup();
    expect(() => player.setRate(0)).toThrow(RangeError);
    expect(() => player.setRate(Number.NaN)).toThrow(RangeError);
    expect(() => player.seek(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

type Op =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'stop' }
  | { kind: 'seek'; to: number }
  | { kind: 'rate'; rate: number }
  | { kind: 'advance'; dt: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constant({ kind: 'play' as const }),
  fc.constant({ kind: 'pause' as const }),
  fc.constant({ kind: 'stop' as const }),
  fc.double({ min: -20, max: DURATION + 20, noNaN: true }).map((to) => ({ kind: 'seek' as const, to })),
  fc.double({ min: MIN_RATE, max: MAX_RATE, noNaN: true }).map((rate) => ({ kind: 'rate' as const, rate })),
  fc.double({ min: 0, max: 60, noNaN: true }).map((dt) => ({ kind: 'advance' as const, dt })),
);

/** Reference model: plain accumulation, no Web Audio. */
function reference(ops: Op[]) {
  let t = 0;
  let playing = false;
  let rate = 1;
  const clamp = (x: number) => Math.min(DURATION, Math.max(0, x));
  const snapshots: Array<{ t: number; playing: boolean }> = [];
  for (const op of ops) {
    switch (op.kind) {
      case 'play':
        if (!(playing && t < DURATION)) {
          if (t >= DURATION) t = 0;
          playing = true;
        }
        break;
      case 'pause':
        playing = false;
        break;
      case 'stop':
        playing = false;
        t = 0;
        break;
      case 'seek':
        t = clamp(op.to);
        break;
      case 'rate':
        rate = op.rate;
        break;
      case 'advance':
        if (playing) t = clamp(t + op.dt * rate);
        break;
    }
    snapshots.push({ t, playing: playing && t < DURATION });
  }
  return snapshots;
}

describe('AudioPlayer properties', () => {
  it('matches the reference model for any play/pause/seek/rate/advance sequence', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        const { ctx, player } = setup();
        const expected = reference(ops);
        ops.forEach((op, i) => {
          if (op.kind === 'play') player.play();
          else if (op.kind === 'pause') player.pause();
          else if (op.kind === 'stop') player.stop();
          else if (op.kind === 'seek') player.seek(op.to);
          else if (op.kind === 'rate') player.setRate(op.rate);
          else ctx.advance(op.dt);
          const want = expected[i]!;
          expect(Math.abs(player.now() - want.t)).toBeLessThan(EPS);
          expect(player.now()).toBeGreaterThanOrEqual(0);
          expect(player.now()).toBeLessThanOrEqual(DURATION);
          expect(player.isPlaying()).toBe(want.playing);
          expect(ctx.sources.filter((s) => s.started && !s.stopped).length).toBeLessThanOrEqual(1);
        });
      }),
      { numRuns: 500 },
    );
  });
});
