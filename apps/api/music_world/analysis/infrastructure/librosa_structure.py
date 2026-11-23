"""Structure stage with librosa: chroma profile (for the key) and repetition-labelled segments.

Segments: agglomerative clustering of beat-synchronous chroma + MFCC features (librosa.segment.agglomerative);
then segments whose mean feature vectors are close (cosine similarity) share a repetition cluster.
"""

import asyncio
import time
from pathlib import Path

import librosa
import numpy as np
import structlog

from music_world.analysis.application.ports import Structure

log = structlog.get_logger(__name__)

SAMPLE_RATE = 22050
HOP = 512
SECONDS_PER_SEGMENT = 20.0
MIN_SEGMENTS, MAX_SEGMENTS = 2, 10
REPEAT_SIMILARITY = 0.95


def _clusters(means: np.ndarray) -> list[int]:
    """Greedy: a segment joins the first earlier cluster whose centroid is similar enough, else opens a new one."""
    unit = means / (np.linalg.norm(means, axis=1, keepdims=True) + 1e-9)
    centroids: list[np.ndarray] = []
    ids: list[int] = []
    for v in unit:
        sims = [float(np.dot(v, c / (np.linalg.norm(c) + 1e-9))) for c in centroids]
        best = int(np.argmax(sims)) if sims else -1
        if best >= 0 and sims[best] >= REPEAT_SIMILARITY:
            ids.append(best)
            centroids[best] = centroids[best] + v
        else:
            ids.append(len(centroids))
            centroids.append(v.copy())
    return ids


def _analyze(mix: Path) -> Structure:
    y, _ = librosa.load(str(mix), sr=SAMPLE_RATE, mono=True)
    if not np.any(y):
        return Structure(chroma_profile=(0.0,) * 12, boundaries=(), clusters=(0,))
    chroma = librosa.feature.chroma_cqt(y=y, sr=SAMPLE_RATE, hop_length=HOP)
    profile = chroma.mean(axis=1)
    mfcc = librosa.feature.mfcc(y=y, sr=SAMPLE_RATE, hop_length=HOP, n_mfcc=13)
    features = np.vstack([chroma, librosa.util.normalize(mfcc, axis=1)])
    _, beats = librosa.beat.beat_track(y=y, sr=SAMPLE_RATE, hop_length=HOP)
    if len(beats) >= 2 * MIN_SEGMENTS:
        sync = librosa.util.sync(features, beats.tolist(), aggregate=np.median)
        frame_of = np.concatenate([[0], beats])
    else:
        sync, frame_of = features, np.arange(features.shape[1])
    duration = len(y) / SAMPLE_RATE
    k = int(np.clip(round(duration / SECONDS_PER_SEGMENT), MIN_SEGMENTS, MAX_SEGMENTS))
    k = min(k, sync.shape[1])
    if k < 2:
        return Structure(chroma_profile=tuple(float(v) for v in profile), boundaries=(), clusters=(0,))
    starts = librosa.segment.agglomerative(sync, k)  # first column index of each segment
    times = librosa.frames_to_time(frame_of[np.minimum(starts, len(frame_of) - 1)], sr=SAMPLE_RATE, hop_length=HOP)
    edges = [*starts.tolist(), sync.shape[1]]
    means = np.stack([sync[:, a:b].mean(axis=1) for a, b in zip(edges, edges[1:], strict=False) if b > a])
    return Structure(
        chroma_profile=tuple(float(v) for v in profile),
        boundaries=tuple(float(t) for t in times[1:]),
        clusters=tuple(_clusters(means)),
    )


class LibrosaStructureAnalyzer:
    async def analyze(self, mix: Path) -> Structure:
        started = time.process_time()
        structure = await asyncio.to_thread(_analyze, mix)
        log.info("analysis.stage_done", stage="structure", segments=len(structure.clusters),
                 cpu_sec=round(time.process_time() - started, 2))  # fmt: skip
        return structure
