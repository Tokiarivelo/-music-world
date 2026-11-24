import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScorePlayer, type ScoreNote } from './score-player';

afterEach(() => vi.useRealTimers());

const score: ScoreNote[] = [
  { time: 1, duration: 0.5, midi: 60, velocity: 0.5 },
  { time: 1.2, duration: 0.5, midi: 64, velocity: 0.5 },
  { time: 3, duration: 0.5, midi: 67, velocity: 0.5 },
];

function setup(start = 0) {
  let t = start;
  let playing = true;
  let rate = 1;
  const played: { midi: number; delay: number }[] = [];
  const player = new ScorePlayer(
    { playAt: (midi, _v, _s, delay) => (played.push({ midi, delay }), true) },
    { now: () => t, isPlaying: () => playing, rate: () => rate },
  );
  player.setScore(score);
  return { player, played, setT: (v: number) => (t = v), setPlaying: (v: boolean) => (playing = v), setRate: (v: number) => (rate = v) };
}

describe('score player (I9)', () => {
  it('schedules each note once, with a delay measured from the clock', () => {
    const s = setup(0.8);
    s.player.tick();
    expect(s.played).toEqual([{ midi: 60, delay: expect.closeTo(0.2, 6) }]);
    s.setT(1.0);
    s.player.tick();
    s.player.tick();
    expect(s.played.map((p) => p.midi)).toEqual([60, 64]);
    expect(s.played[1]!.delay).toBeCloseTo(0.2, 6);
  });

  it('plays nothing while the song is paused and never plays notes that have passed', () => {
    const s = setup(0);
    s.setPlaying(false);
    s.setT(1);
    s.player.tick();
    expect(s.played).toEqual([]);
    s.setPlaying(true);
    s.setT(2);
    s.player.tick();
    expect(s.played).toEqual([]);
  });

  it('a seek back replays from the new place, a seek forward skips the notes in between', () => {
    const s = setup(2.9);
    s.player.tick();
    expect(s.played.map((p) => p.midi)).toEqual([67]);
    s.setT(0.9);
    s.player.tick();
    expect(s.played.map((p) => p.midi)).toEqual([67, 60, 64]); // both are inside the 0.35 s window
    s.setT(5);
    s.player.tick();
    expect(s.played).toHaveLength(3);
  });

  it('the delay shrinks with the playback rate and a replaced score keeps the clock position', () => {
    const s = setup(0.6);
    s.setRate(2);
    s.player.tick();
    expect(s.played[0]!.delay).toBeCloseTo(0.2, 6); // 0.4 s of song at double speed
    s.player.setScore([{ time: 0.9, duration: 1, midi: 72, velocity: 1 }]);
    s.setT(0.7);
    s.player.tick();
    expect(s.played.at(-1)!.midi).toBe(72);
  });

  it('frames schedule only between start and stop', () => {
    const s = setup(0.9);
    s.player.frame();
    expect(s.played.length).toBe(0);
    s.player.start();
    expect(s.player.running).toBe(true);
    s.player.frame();
    expect(s.played.length).toBeGreaterThan(0);
    s.player.stop();
    expect(s.player.running).toBe(false);
  });
});
