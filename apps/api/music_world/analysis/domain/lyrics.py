"""Timed lyrics (requirement 6) and the `.lrc` parser (requirement 1.5). Lyrics are user content: never log text."""

import re
from collections.abc import Iterable
from dataclasses import dataclass

# A line without a following timestamp stays on screen this long.
LAST_LINE_SEC = 5.0
MAX_TEXT_CHARS = 500
MAX_LINES = 2000

_TIME_TAG = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
_OFFSET_TAG = re.compile(r"^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$", re.IGNORECASE)
_WORD_TAG = re.compile(r"<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


@dataclass(frozen=True)
class LyricLine:
    start: float
    end: float
    text: str


def _seconds(minutes: str, seconds: str, fraction: str | None) -> float | None:
    sec = int(seconds)
    if sec >= 60:
        return None
    frac = int(fraction) / (10 ** len(fraction)) if fraction else 0.0
    return int(minutes) * 60 + sec + frac


def parse_lrc(text: str) -> list[LyricLine]:
    """Parses LRC: `[mm:ss.xx]text` lines (several time tags per line allowed), `[offset:±ms]` (positive = earlier),
    enhanced `<mm:ss.xx>` word tags stripped, metadata tags (`[ar:…]`) ignored. A line ends where the next timed line
    (or an empty timed line) starts; the last one lasts `LAST_LINE_SEC`. Returns lines sorted by start."""
    offset = 0.0
    stamped: list[tuple[float, str]] = []
    for raw in text.splitlines():
        if m := _OFFSET_TAG.match(raw):
            offset = int(m.group(1)) / 1000
            continue
        pos, times = 0, []
        line = raw.strip()
        while m := _TIME_TAG.match(line, pos):
            t = _seconds(m.group(1), m.group(2), m.group(3))
            if t is not None:
                times.append(t)
            pos = m.end()
        if not times:
            continue
        words = _CONTROL.sub("", _WORD_TAG.sub("", line[pos:])).strip()[:MAX_TEXT_CHARS]
        stamped.extend((t, words) for t in times)
    stamped.sort(key=lambda item: item[0])
    lines: list[LyricLine] = []
    for i, (t, words) in enumerate(stamped):
        if not words:
            continue  # an empty timed line only ends the previous one
        start = max(0.0, t - offset)
        end = max(start, stamped[i + 1][0] - offset) if i + 1 < len(stamped) else start + LAST_LINE_SEC
        lines.append(LyricLine(start, end, words))
        if len(lines) >= MAX_LINES:
            break
    return lines


def fit_lyrics(lines: Iterable[LyricLine], duration_sec: float) -> list[LyricLine]:
    """Keeps lines that start inside the song and clamps their end to it."""
    return [
        LyricLine(line.start, min(line.end, duration_sec), line.text) for line in lines if line.start <= duration_sec
    ]
