# 001. Analysis ML stack on CPU: Demucs + Basic Pitch (ONNX) + librosa
**Date:** 2026-11-23 · **Status:** Accepted
## Context
The worker must separate stems (Demucs htdemucs) and transcribe notes (Spotify Basic Pitch) on one OVHcloud CPU
instance, with Python 3.12 and an MIT repository (no GPL/AGPL). `basic-pitch` 0.4.0 (latest) hard-requires
TensorFlow < 2.15.1 on Linux, which has no Python 3.12 wheels. Default PyPI `torch` wheels pull ~3 GB of CUDA
libraries.
## Decision
- `torch` / `torchaudio` come from the PyTorch CPU index (`[tool.uv.sources]` in `apps/api/pyproject.toml`).
- `basic-pitch[onnx]` runs its bundled ONNX model (`saved_models/icassp_2022/nmp.onnx`) with onnxruntime; uv
  `override-dependencies` removes the TensorFlow, CoreML and TFLite requirements and lifts `resampy` to ≥ 0.4.3
  (older releases import the removed `pkg_resources`).
- Demucs is called with `shifts=0` so the same audio always gives the same stems (reproducible worlds).
- Licenses (checked from the installed metadata): demucs MIT, basic-pitch Apache-2.0, librosa ISC, torch BSD,
  onnxruntime MIT, sphn Apache-2.0, soundfile BSD. Two transitive libraries are LGPL — `lameenc` (LGPL-3.0, Demucs'
  MP3 export, unused) and `soxr` (LGPL-2.1, librosa's resampler) — dynamically linked, unmodified, which the LGPL
  allows in an MIT project. No GPL/AGPL dependency.
## Consequences
- The API image grows by ~1.4 GB (torch CPU + models); weights download on first use (Demucs ~80 MB from
  `dl.fbaipublicfiles.com`), so the worker image should pre-download them (infrastructure.md).
- If basic-pitch ever drops the ONNX model, the adapter fails fast with `TRANSCRIPTION_FAILED` at model load.
- Measured CPU cost: `.kiro/specs/02-music-analysis/design.md` § As built.
