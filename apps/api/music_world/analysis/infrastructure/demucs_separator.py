"""Separate stage: Demucs (htdemucs, CPU) → vocals / drums / bass / other stems as 16-bit FLAC.

The model is loaded once per worker process (lazy singleton). `shifts=0` keeps the output deterministic (Demucs'
random time shifts would change stems, hence notes, between runs of the same audio).
"""

import asyncio
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import structlog

from music_world.analysis.domain.audio import MIX_SAMPLE_RATE, STEMS, DecodedAudio
from music_world.analysis.domain.errors import SeparationError

log = structlog.get_logger(__name__)

SEGMENT_OVERLAP = 0.25
_models: dict[str, Any] = {}
_lock = threading.Lock()


def _model(name: str) -> Any:
    with _lock:
        if name not in _models:
            from demucs.pretrained import get_model  # heavy import, worker only

            started = time.perf_counter()
            model = get_model(name)
            model.eval()
            _models[name] = model
            log.info("analysis.model_loaded", model=name, wall_sec=round(time.perf_counter() - started, 2))
        return _models[name]


def _separate(model_name: str, mix: Path, out_dir: Path) -> dict[str, Path]:
    import torch
    from demucs.apply import apply_model

    model = _model(model_name)
    if model.samplerate != MIX_SAMPLE_RATE:
        raise SeparationError(f"model expects {model.samplerate} Hz")
    data, rate = sf.read(str(mix), dtype="float32", always_2d=True)  # (frames, channels)
    if data.shape[1] == 1:
        data = np.repeat(data, 2, axis=1)
    wav: torch.Tensor = torch.from_numpy(np.ascontiguousarray(data.T))
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.inference_mode():
        sources = apply_model(
            model, ((wav - mean) / std)[None], shifts=0, split=True, overlap=SEGMENT_OVERLAP, progress=False
        )[0]
    sources = sources * std + mean
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for name, source in zip(model.sources, sources, strict=True):
        if name in STEMS:
            path = out_dir / f"{name}.flac"
            sf.write(str(path), np.clip(source.numpy().T, -1.0, 1.0), rate, subtype="PCM_16")
            paths[name] = path
    missing = set(STEMS) - paths.keys()
    if missing:
        raise SeparationError(f"model did not produce stems {sorted(missing)}")
    return paths


class DemucsSeparator:
    def __init__(self, model_name: str = "htdemucs") -> None:
        self._model_name = model_name

    async def separate(self, mix: DecodedAudio, out_dir: Path) -> dict[str, Path]:
        started_wall, started_cpu = time.perf_counter(), time.process_time()
        try:
            stems = await asyncio.to_thread(_separate, self._model_name, mix.path, out_dir)
        except SeparationError:
            raise
        except Exception as error:  # torch/demucs errors become a stable code; the traceback is logged
            log.exception("analysis.separate_failed")
            raise SeparationError("source separation failed") from error
        log.info(
            "analysis.stage_done",
            stage="separate",
            duration_sec=round(mix.duration_sec, 2),
            wall_sec=round(time.perf_counter() - started_wall, 2),
            cpu_sec=round(time.process_time() - started_cpu, 2),
        )
        return stems
