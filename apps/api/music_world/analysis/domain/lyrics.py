"""Timed lyrics (requirement 6) and the `.lrc` parser (requirement 1.5). Lyrics are user content: never log text."""

import re
from collections.abc import Iterable, Sequence
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


# Synced lyrics found online are trusted only when they look like a whole song: enough lines, spread over it.
MIN_FOUND_LINES = 4
MIN_FOUND_SPAN_RATIO = 0.4
# A found track whose length differs from the audio by more than this is another version (live, edit, remaster).
MAX_DURATION_DIFF_SEC = 4.0


def is_plausible_lyrics(lines: Sequence[LyricLine], duration_sec: float) -> bool:
    """True when `lines` could be the lyrics of a song of `duration_sec`: at least `MIN_FOUND_LINES` lines whose span
    covers a good part of it. Guards against a stub or the lyrics of another song."""
    if len(lines) < MIN_FOUND_LINES or duration_sec <= 0:
        return False
    span = lines[-1].start - lines[0].start
    return span >= MIN_FOUND_SPAN_RATIO * min(duration_sec, MAX_ANALYZED_FOR_SPAN)


MAX_ANALYZED_FOR_SPAN = 300.0


def clean_asr_lines(lines: Iterable[LyricLine]) -> list[LyricLine]:
    """Speech-recognition output → lyrics: drops empty lines and the immediate repeats a recogniser produces when it
    loops on a held vowel or on silence (the same text three times in a row keeps one)."""
    out: list[LyricLine] = []
    repeats = 0
    for line in lines:
        text = _CONTROL.sub("", line.text).strip()[:MAX_TEXT_CHARS]
        if not text or not any(ch.isalpha() for ch in text):
            continue
        if out and out[-1].text.casefold() == text.casefold():
            repeats += 1
            if repeats >= 2:
                continue
        else:
            repeats = 0
        out.append(LyricLine(line.start, max(line.end, line.start), text))
        if len(out) >= MAX_LINES:
            break
    return out


def fit_lyrics(lines: Iterable[LyricLine], duration_sec: float) -> list[LyricLine]:
    """Keeps lines that start inside the song and clamps their end to it."""
    return [
        LyricLine(line.start, min(line.end, duration_sec), line.text) for line in lines if line.start <= duration_sec
    ]


# A catalog track whose length is within this ratio of the audio's is the same song in another cut: its timings are
# stretched to the audio instead of the track being refused.
MAX_STRETCH_RATIO = 0.10

_NOISE = re.compile(r"[\(\[][^\)\]]*[\)\]]")  # "(Official Video)", "[HD]", "(Unplugged)"
_TRACK_NUMBER = re.compile(r"^\s*\d{1,3}\s*[-._)]*\s+")


def guess_artist_title(file_name: str) -> tuple[str, str] | None:
    """`Artist - Title` out of an upload's file name (extension, track number and bracketed noise dropped); None when
    the name does not have that shape. Only a guess: it feeds the catalog lookup, which then checks the duration."""
    stem = file_name.replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0].replace("_", " ")
    stem = _TRACK_NUMBER.sub("", _NOISE.sub(" ", stem))
    artist, sep, title = stem.partition(" - ")
    artist, title = " ".join(artist.split()), " ".join(title.split())
    if not sep or not artist or not title:
        return None
    return artist[:200], title[:200]


def stretch_lyrics(lines: Sequence[LyricLine], factor: float) -> list[LyricLine]:
    """Scales every timing by `factor` (found track length → audio length)."""
    return [LyricLine(line.start * factor, line.end * factor, line.text) for line in lines]
