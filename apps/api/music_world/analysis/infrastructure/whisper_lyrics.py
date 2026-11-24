"""Lyrics by speech recognition on the vocal stem (faster-whisper, CPU, int8). Used when the song is not found in the
online catalog and the user gave no .lrc.

Cost control: the stem is skipped when it is nearly silent (an instrumental never reaches the model); the model sees
the isolated voice only, with voice-activity filtering, greedy decoding and no conditioning on its previous text (the
cheapest setting, and the one that avoids the runaway repetitions Whisper produces on music); the language is detected
once; the model is loaded once per worker. The text is never logged.
"""

import asyncio
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import structlog

from music_world.analysis.domain.lyrics import LyricLine, clean_asr_lines

log = structlog.get_logger(__name__)

FRAME_SEC = 0.05
ACTIVE_RMS = 0.01
MIN_ACTIVE_RATIO = 0.08  # less than 8 % of the song sung: treat as instrumental
MAX_NO_SPEECH = 0.6
MIN_AVG_LOGPROB = -1.2


def vocal_activity(samples: np.ndarray, sample_rate: int) -> float:
    """Share of 50 ms frames of the vocal stem whose level is above a speech floor (0 for silence)."""
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    frame = max(1, int(sample_rate * FRAME_SEC))
    count = len(samples) // frame
    if count == 0:
        return 0.0
    frames = samples[: count * frame].reshape(count, frame)
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1))
    return float((rms > ACTIVE_RMS).mean())


class WhisperLyricsTranscriber:
    def __init__(self, model: str = "base", language: str | None = None) -> None:
        self._model_name, self._language = model, language
        self._model: Any = None

    def _load(self) -> Any:
        if self._model is None:
            from faster_whisper import WhisperModel  # type: ignore[import-untyped]  # heavy, worker only

            self._model = WhisperModel(self._model_name, device="cpu", compute_type="int8")
        return self._model

    async def transcribe(self, vocals: Path, duration_sec: float) -> list[LyricLine]:
        return await asyncio.to_thread(self._run, vocals, duration_sec)

    def _run(self, vocals: Path, duration_sec: float) -> list[LyricLine]:
        samples, rate = sf.read(str(vocals), dtype="float32", always_2d=False)
        activity = vocal_activity(samples, rate)
        if activity < MIN_ACTIVE_RATIO:
            log.info("analysis.lyrics_skipped", reason="no_vocals", activity=round(activity, 3))
            return []
        try:
            segments, info = self._load().transcribe(
                str(vocals),
                language=self._language,
                beam_size=1,
                condition_on_previous_text=False,
                vad_filter=True,
                word_timestamps=False,
            )
            lines = [
                LyricLine(float(s.start), float(s.end), str(s.text))
                for s in segments
                if s.no_speech_prob <= MAX_NO_SPEECH and s.avg_logprob >= MIN_AVG_LOGPROB and s.start <= duration_sec
            ]
        except Exception as error:  # a missing model download or a runtime failure must not fail the analysis
            log.warning("analysis.lyrics_asr_failed", error=type(error).__name__)
            return []
        kept = clean_asr_lines(lines)
        log.info("analysis.lyrics_asr", lines=len(kept), language=getattr(info, "language", None))
        return kept
