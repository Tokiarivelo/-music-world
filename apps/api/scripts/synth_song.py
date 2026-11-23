"""Synthesize a deterministic, self-made (royalty-free) song: pads, bass, melody and drums.

Usage: uv run python scripts/synth_song.py <out.wav|out.flac> [seconds] [sample_rate]
       uv run python scripts/synth_song.py --demo <out.wav|out.flac> [sample_rate]

Loop mode: Am – F – C – G at 100 BPM, one chord per bar (analysis fixtures ≤ 10 s, 3-minute CPU measurement).
`--demo`: the demo song "Neon Nocturne" (57.6 s): intro, verse, chorus (F – C – G – Am, higher melody), outro.
"""

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

BPM = 100.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
# (root midi, chord tones) per bar.
PROGRESSION = [(45, (57, 60, 64)), (41, (53, 57, 60)), (48, (55, 60, 64)), (43, (55, 59, 62))]
MELODY = [76, 74, 72, 74, 76, 76, 76, 72, 74, 74, 74, 79, 76, 72, 71, 69]  # one note per beat, 4 bars


def hz(midi: float) -> float:
    return float(440.0 * 2 ** ((midi - 69) / 12))


def tone(freq: float, seconds: float, sr: int, harmonics: int = 3) -> np.ndarray:
    t = np.arange(int(seconds * sr)) / sr
    wave = sum(np.sin(2 * np.pi * freq * (h + 1) * t) / (h + 1) ** 1.5 for h in range(harmonics))
    attack = np.minimum(1.0, t / 0.01)
    release = np.minimum(1.0, (seconds - t) / 0.05).clip(0, 1)
    return np.asarray(wave * attack * release, dtype=np.float64)


def kick(sr: int) -> np.ndarray:
    t = np.arange(int(0.25 * sr)) / sr
    freq = 50 + 100 * np.exp(-t * 30)
    return np.asarray(np.sin(2 * np.pi * np.cumsum(freq) / sr) * np.exp(-t * 18), dtype=np.float64)


def snare(sr: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(0.18 * sr)) / sr
    return np.asarray(rng.uniform(-1, 1, t.size) * np.exp(-t * 25) * 0.6, dtype=np.float64)


def hat(sr: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(0.05 * sr)) / sr
    noise = rng.uniform(-1, 1, t.size)
    return np.asarray(np.diff(noise, prepend=0) * np.exp(-t * 80) * 0.25, dtype=np.float64)


def add(track: np.ndarray, start: float, sound: np.ndarray, sr: int, gain: float) -> None:
    i = int(start * sr)
    end = min(track.size, i + sound.size)
    if i < end:
        track[i:end] += gain * sound[: end - i]


CHORUS_PROGRESSION = [(41, (53, 57, 60)), (48, (55, 60, 64)), (43, (55, 59, 62)), (45, (57, 60, 64))]
CHORUS_MELODY = [81, 79, 77, 76, 79, 79, 76, 72, 79, 81, 83, 79, 76, 74, 72, 76]
# (section, bars): intro = pads + bass, verse = full band, chorus = new chords and a higher melody, outro = pads.
DEMO_FORM = [("intro", 4), ("verse", 8), ("chorus", 8), ("outro", 4)]


def synth_demo(sr: int = 44100) -> np.ndarray:
    """The demo song: a fixed arrangement over `DEMO_FORM` (deterministic, royalty-free by construction)."""
    rng = np.random.default_rng(11)
    bars = sum(n for _, n in DEMO_FORM)
    n = int(bars * BAR * sr)
    pads, bass, lead, drums = (np.zeros(n) for _ in range(4))
    k, s, h = kick(sr), snare(sr, rng), hat(sr, rng)
    bar = 0
    for section, count in DEMO_FORM:
        for i in range(count):
            chorus = section == "chorus"
            root, chord = (CHORUS_PROGRESSION if chorus else PROGRESSION)[i % 4]
            melody = CHORUS_MELODY if chorus else MELODY
            start = bar * BAR
            fade = 1.0 - i / count if section == "outro" else 1.0
            for m in chord:
                add(pads, start, tone(hz(m), BAR * 0.95, sr, 4), sr, 0.12 * fade)
            for beat in range(4):
                t = start + beat * BEAT
                add(bass, t, tone(hz(root), BEAT * 0.8, sr, 2), sr, 0.35 * fade)
                if section in ("verse", "chorus"):
                    add(lead, t, tone(hz(melody[(i % 4) * 4 + beat]), BEAT * 0.7, sr, 3), sr, 0.2 if chorus else 0.16)
                    add(drums, t, k if beat % 2 == 0 else s, sr, 0.9 if chorus else 0.75)
                    add(drums, t + BEAT / 2, h, sr, 1.0)
                elif section == "intro" and i >= 2:
                    add(drums, t + BEAT / 2, h, sr, 0.6)
            bar += 1
    left = pads * 1.1 + bass + lead * 0.8 + drums
    right = pads * 0.9 + bass + lead * 1.2 + drums
    stereo = np.stack([left, right], axis=1)
    return np.asarray(stereo / (float(np.abs(stereo).max()) or 1.0) * 0.9, dtype=np.float32)


def synth(seconds: float, sr: int = 44100) -> np.ndarray:
    rng = np.random.default_rng(7)
    n = int(seconds * sr)
    pads, bass, lead, drums = (np.zeros(n) for _ in range(4))
    k, s, h = kick(sr), snare(sr, rng), hat(sr, rng)
    bar = 0
    while bar * BAR < seconds:
        root, chord = PROGRESSION[bar % len(PROGRESSION)]
        start = bar * BAR
        for m in chord:
            add(pads, start, tone(hz(m), BAR * 0.95, sr, 4), sr, 0.12)
        for beat in range(4):
            t = start + beat * BEAT
            add(bass, t, tone(hz(root), BEAT * 0.8, sr, 2), sr, 0.35)
            add(lead, t, tone(hz(MELODY[(bar % 4) * 4 + beat]), BEAT * 0.7, sr, 3), sr, 0.18)
            add(drums, t, k if beat % 2 == 0 else s, sr, 0.8)
            add(drums, t + BEAT / 2, h, sr, 1.0)
        bar += 1
    left = pads * 1.1 + bass + lead * 0.8 + drums
    right = pads * 0.9 + bass + lead * 1.2 + drums
    stereo = np.stack([left, right], axis=1)
    peak = float(np.abs(stereo).max()) or 1.0
    return np.asarray(stereo / peak * 0.9, dtype=np.float32)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: synth_song.py [--demo] <out.wav|out.flac> [seconds] [sample_rate]")
    if sys.argv[1] == "--demo":
        out = Path(sys.argv[2])
        rate = int(sys.argv[3]) if len(sys.argv) > 3 else 44100
        audio = synth_demo(rate)
        secs = len(audio) / rate
    else:
        out = Path(sys.argv[1])
        secs = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
        rate = int(sys.argv[3]) if len(sys.argv) > 3 else 44100
        audio = synth(secs, rate)
    if out.suffix == ".flac":
        sf.write(str(out), audio, rate, subtype="PCM_16")
    else:
        sf.write(str(out), audio, rate)
    print(f"[synth] wrote {out} ({secs:.1f} s, {rate} Hz)")
