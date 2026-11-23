/**
 * Renders a playable demo song from an analysis' own notes (sine + triangle voices) with an OfflineAudioContext.
 * Royalty-free by construction; used on `/play/demo` until the analysed demo song exists (roadmap 3.6).
 */
import { SYNTH_ATTACK_SEC, SYNTH_GAIN, SYNTH_RELEASE_SEC, SYNTH_SAMPLE_RATE } from '../consts/player.consts';

export interface SynthNote {
  readonly time: number;
  readonly duration: number;
  readonly midi: number;
  readonly velocity: number;
  readonly stem: string;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export async function synthesizeSong(
  notes: readonly SynthNote[],
  durationSec: number,
  Offline: typeof OfflineAudioContext = OfflineAudioContext,
): Promise<AudioBuffer> {
  const ctx = new Offline(2, Math.ceil(durationSec * SYNTH_SAMPLE_RATE), SYNTH_SAMPLE_RATE);
  for (const n of notes) {
    const osc = ctx.createOscillator();
    osc.type = n.stem === 'bass' ? 'triangle' : 'sine';
    osc.frequency.value = midiToHz(n.midi);
    const gain = ctx.createGain();
    const peak = SYNTH_GAIN * (0.3 + 0.7 * n.velocity);
    const end = Math.min(durationSec, n.time + n.duration);
    gain.gain.setValueAtTime(0, n.time);
    gain.gain.linearRampToValueAtTime(peak, n.time + SYNTH_ATTACK_SEC);
    gain.gain.setValueAtTime(peak, Math.max(n.time + SYNTH_ATTACK_SEC, end - SYNTH_RELEASE_SEC));
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(n.time);
    osc.stop(end);
  }
  return ctx.startRendering();
}
