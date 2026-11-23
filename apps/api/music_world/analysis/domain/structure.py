"""Sections and energy curve (pure functions, requirements 4.3 and 4.4)."""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

# Sections shorter than this are merged into their neighbour.
MIN_SECTION_SEC = 4.0
# Intro / outro: a non-repeated first / last segment shorter than this share of the song.
EDGE_SECTION_SHARE = 0.2
ENERGY_RATE_HZ = 10


@dataclass(frozen=True)
class SectionSpan:
    start: float
    end: float
    label: str


@dataclass(frozen=True)
class EnergySample:
    time: float
    value: float


def build_segments(
    boundaries: Sequence[float], clusters: Sequence[int], duration_sec: float, min_len: float = MIN_SECTION_SEC
) -> list[tuple[float, float, int]]:
    """Contiguous `(start, end, cluster)` segments covering `[0, duration_sec]`.

    `boundaries` are the inner cut times (any order, any values); `clusters[i]` is the repetition cluster of segment i
    (missing ids get their own cluster). Cuts outside the song, duplicates and segments shorter than `min_len` are
    removed (a short segment is merged into the previous one).
    """
    cuts = sorted({b for b in boundaries if 0.0 < b < duration_sec})
    edges = [0.0, *cuts, duration_sec]
    raw = [(edges[i], edges[i + 1], clusters[i] if i < len(clusters) else -1 - i) for i in range(len(edges) - 1)]
    segments: list[tuple[float, float, int]] = []
    for start, end, cluster in raw:
        if segments and end - start < min_len:
            prev = segments[-1]
            segments[-1] = (prev[0], end, prev[2])
        elif segments and segments[-1][1] - segments[-1][0] < min_len:
            prev = segments[-1]  # the first segment was too short: it absorbs this one
            segments[-1] = (prev[0], end, cluster)
        else:
            segments.append((start, end, cluster))
    return segments


def label_sections(segments: Sequence[tuple[float, float, int]], duration_sec: float) -> list[SectionSpan]:
    """Labels segments by repetition: the repeated cluster covering most time is `chorus`, the next repeated one
    `verse`; a short non-repeated first / last segment is `intro` / `outro`; the first other non-repeated segment
    is `bridge`; everything else is `section_<n>` (n = cluster rank)."""
    counts = Counter(c for _, _, c in segments)
    total: dict[int, float] = {}
    for start, end, c in segments:
        total[c] = total.get(c, 0.0) + end - start
    first_seen = {c: i for i, (_, _, c) in reversed(list(enumerate(segments)))}
    repeated = sorted((c for c in counts if counts[c] > 1), key=lambda c: (-total[c], first_seen[c]))
    names: dict[int, str] = {}
    for c, name in zip(repeated, ("chorus", "verse"), strict=False):
        names[c] = name
    rank = {c: i for i, c in enumerate(sorted(counts, key=lambda c: first_seen[c]))}
    labels: list[str] = []
    bridge_used = False
    for i, (start, end, c) in enumerate(segments):
        short_edge = counts[c] == 1 and (end - start) <= EDGE_SECTION_SHARE * duration_sec
        if c in names:
            labels.append(names[c])
        elif i == 0 and short_edge and len(segments) > 1:
            labels.append("intro")
        elif i == len(segments) - 1 and short_edge and len(segments) > 1:
            labels.append("outro")
        elif counts[c] == 1 and not bridge_used and 0 < i < len(segments) - 1:
            labels.append("bridge")
            bridge_used = True
        else:
            labels.append(f"section_{rank[c]}")
    return [SectionSpan(s, e, label) for (s, e, _), label in zip(segments, labels, strict=True)]


def normalize_energy(rms: Sequence[float], duration_sec: float, rate_hz: int = ENERGY_RATE_HZ) -> list[EnergySample]:
    """RMS frames sampled at `rate_hz` → points in `[0, duration_sec]` with values scaled to 0–1 by the peak."""
    peak = max((v for v in rms if v > 0), default=0.0)
    samples: list[EnergySample] = []
    for i, value in enumerate(rms):
        t = i / rate_hz
        if t > duration_sec:
            break
        samples.append(EnergySample(t, min(1.0, max(0.0, value / peak)) if peak > 0 else 0.0))
    return samples
