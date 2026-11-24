import { describe, expect, it, vi } from 'vitest';
import { NoteSynth, VOICE_POOL, midiToHz, type SynthContext, type SynthGain, type SynthOscillator, type SynthParam } from './note-synth';

const param = (): SynthParam => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});

function fakeContext() {
  const oscs: SynthOscillator[] = [];
  const ctx: SynthContext & { resume: ReturnType<typeof vi.fn> } = {
    currentTime: 1,
    destination: {},
    state: 'suspended',
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: () => {
      const o: SynthOscillator = {
        type: '',
        frequency: param(),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      oscs.push(o);
      return o;
    },
    createGain: (): SynthGain => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() }),
  };
  return { ctx, oscs };
}

describe('note synth (I9)', () => {
  it('frequency table: A4 440 Hz, C4 261.63 Hz, octave doubles', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(60)).toBeCloseTo(261.63, 2);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });

  it('creates the context lazily, resumes it and sets the pitch', () => {
    const { ctx, oscs } = fakeContext();
    const create = vi.fn(() => ctx);
    const synth = new NoteSynth(create);
    expect(create).not.toHaveBeenCalled();
    expect(synth.playNote(69, 0.8)).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();
    expect(oscs[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(440, 1);
    synth.playNote(60);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps at most 8 voices (steals the oldest) and frees a voice when it ends', () => {
    const { ctx, oscs } = fakeContext();
    const synth = new NoteSynth(() => ctx);
    for (let i = 0; i < VOICE_POOL + 4; i += 1) synth.playNote(60 + i);
    expect(synth.activeVoices).toBe(VOICE_POOL);
    oscs[oscs.length - 1]!.onended?.();
    expect(synth.activeVoices).toBe(VOICE_POOL - 1);
    synth.dispose();
    expect(synth.activeVoices).toBe(0);
  });

  it('returns false without audio support or with a bad pitch', () => {
    expect(new NoteSynth(() => null).playNote(60)).toBe(false);
    expect(new NoteSynth(() => fakeContext().ctx).playNote(Number.NaN)).toBe(false);
  });
});
