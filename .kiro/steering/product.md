---
inclusion: always
---

# Product: Music World

Music World turns a song into a living 3D world. It runs in the browser and in Meta Quest (WebXR). The world is built
from the music's notes, chords, rhythm, lyrics and mood, following a **template** that anyone can publish in a
community store.

The full design document is `PROJECT.md` (French). This file is the English summary that guides every task.

## Target experience

1. Upload an audio file (MP3, WAV, FLAC; max 3 minutes in the MVP).
2. The backend analyses it: notes, chords, tempo, key, energy, sections, lyrics.
3. An LLM (Meta Muse Spark) reads a text summary of the analysis and proposes a world template.
4. The user picks that template, a store template, or the default `neon-nocturne`.
5. During playback, notes slide along a glowing musical staff, drop onto the terrain and build the world.
6. The user explores with the mouse, or in VR on a Meta Quest.

## Default look (must match `assets/reference-image-original.png`)

- Isometric camera above a dark, cracked square terrain plate, with low mountains on its edges.
- A glowing white-cyan 5-line staff crossing the plate **diagonally** with a soft curve; treble clef at both ends.
- Glowing white note glyphs (quarter, eighth, beamed sixteenth notes) on the staff, with a halo.
- A city on the left side: lit buildings and vertical "equalizer" spikes, gradient violet → magenta → cyan.
- Curved light arcs around the staff, floating particles, controlled bloom, near-black blue background.
- Palette: background `#07051a`, terrain `#1a1533`, primary `#b04cff`, accent `#ff4fd8`,
  secondary `#22d3ee`, staff `#e8f7ff`.

Everything above is a template value: users can change colors, shapes and layout. Without a choice, use this look.

## MVP scope (Kiroween 2026, deadline 2026-12-04 14:00 PT)

In scope: audio upload and analysis (Python), lyrics via Muse Voice Transcribe, AI World Director (Muse Spark → template
JSON), deterministic world engine, default template, template store, VR mode (tabletop diorama), OVHcloud deployment.

Out of scope: live microphone input, video export, full-scale VR walking, self-hosted LLM, GPU inference.

## Product rules

- The world is always reproducible: same audio + same template + same seed = same world.
- Seeking anywhere in the song shows exactly the world at that time.
- A missing API key or a failing model must never break the demo: fall back to the deterministic mock and the default template.
- All user-facing text, README and demo materials are in **English** (hackathon rule).
- Demo audio must be royalty-free or self-composed.
