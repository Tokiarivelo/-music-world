"""Transcribe stage: Spotify Basic Pitch (Apache-2.0) on one stem → `RawNote`s.

Runs the ONNX model bundled with basic-pitch through onnxruntime (TensorFlow is not installed, see
pyproject `override-dependencies`). The model is loaded once per worker process. `predict()` is not used because it
prints to stdout; the same two steps are called directly.
"""

import asyncio
import threading
import time
from pathlib import Path
from typing import Any

import structlog

from music_world.analysis.domain.errors import TranscriptionError
from music_world.analysis.domain.notes import MIN_NOTE_DURATION_SEC, RawNote

log = structlog.get_logger(__name__)

ONSET_THRESHOLD = 0.5
FRAME_THRESHOLD = 0.3
# Frequency band per stem (Hz); None = unbounded. Cuts octave errors and bleed between stems.
FREQ_RANGE: dict[str, tuple[float | None, float | None]] = {
    "bass": (30.0, 400.0),
    "vocals": (80.0, 1200.0),
    "other": (None, None),
}

_model: Any = None
_lock = threading.Lock()


def _load() -> Any:
    global _model
    with _lock:
        if _model is None:
            from basic_pitch import ICASSP_2022_MODEL_PATH
            from basic_pitch.inference import Model

            if Path(ICASSP_2022_MODEL_PATH).suffix != ".onnx":
                raise TranscriptionError("basic-pitch ONNX model not available")
            _model = Model(ICASSP_2022_MODEL_PATH)
            log.info("analysis.model_loaded", model="basic-pitch-onnx")
        return _model


def _transcribe(path: Path, stem: str) -> list[RawNote]:
    from basic_pitch import note_creation
    from basic_pitch.constants import AUDIO_SAMPLE_RATE, FFT_HOP
    from basic_pitch.inference import run_inference

    output = run_inference(path, _load())
    low, high = FREQ_RANGE.get(stem, (None, None))
    _, events = note_creation.model_output_to_notes(
        output,
        onset_thresh=ONSET_THRESHOLD,
        frame_thresh=FRAME_THRESHOLD,
        min_note_len=max(1, round(MIN_NOTE_DURATION_SEC * AUDIO_SAMPLE_RATE / FFT_HOP)),
        min_freq=low,
        max_freq=high,
        melodia_trick=True,
    )
    return [
        RawNote(time=float(start), duration=float(end) - float(start), midi=int(pitch), velocity=float(amp), stem=stem)
        for start, end, pitch, amp, _bends in events
        if float(end) > float(start)
    ]


class BasicPitchTranscriber:
    async def transcribe(self, stem_path: Path, stem: str) -> list[RawNote]:
        started_wall, started_cpu = time.perf_counter(), time.process_time()
        try:
            notes = await asyncio.to_thread(_transcribe, stem_path, stem)
        except TranscriptionError:
            raise
        except Exception as error:
            log.exception("analysis.transcribe_failed", stem=stem)
            raise TranscriptionError("note transcription failed") from error
        log.info(
            "analysis.stage_done",
            stage="transcribe",
            stem=stem,
            notes=len(notes),
            wall_sec=round(time.perf_counter() - started_wall, 2),
            cpu_sec=round(time.process_time() - started_cpu, 2),
        )
        return notes
