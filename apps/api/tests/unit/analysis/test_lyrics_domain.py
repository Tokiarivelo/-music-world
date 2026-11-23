"""`.lrc` parsing (requirements 1.5, 6.2)."""

from hypothesis import given
from hypothesis import strategies as st

from music_world.analysis.domain.lyrics import LAST_LINE_SEC, LyricLine, fit_lyrics, parse_lrc

SONG = """﻿[ar:Someone]
[ti:Demo]
[00:01.50]First line
[00:04.00][00:20.00]Chorus line
[00:06.250]<00:06.25>Word <00:06.80>tags
[00:08.00]
[01:02.5]Late
garbage line without tag
[00:99.00]bad seconds
"""


def test_parses_lines_tags_ends_and_repeats() -> None:
    lines = parse_lrc(SONG)
    assert [(line.start, line.text) for line in lines] == [
        (1.5, "First line"),
        (4.0, "Chorus line"),
        (6.25, "Word tags"),
        (20.0, "Chorus line"),
        (62.5, "Late"),
    ]
    assert [line.end for line in lines] == [4.0, 6.25, 8.0, 62.5, 62.5 + LAST_LINE_SEC]


def test_offset_shifts_lines_earlier_and_never_below_zero() -> None:
    lines = parse_lrc("[offset:+500]\n[00:00.20]a\n[00:02.00]b")
    assert [(line.start, line.end) for line in lines] == [(0.0, 1.5), (1.5, 1.5 + LAST_LINE_SEC)]


def test_text_without_timestamps_gives_nothing() -> None:
    assert parse_lrc("just some words\n[ar:x]\n") == []


def test_fit_lyrics_clamps_to_the_song() -> None:
    lines = [LyricLine(1, 3, "a"), LyricLine(9, 15, "b"), LyricLine(11, 12, "c")]
    assert fit_lyrics(lines, 10) == [LyricLine(1, 3, "a"), LyricLine(9, 10, "b")]


@given(st.text(max_size=400))
def test_any_text_parses_to_sorted_non_empty_bounded_lines(text: str) -> None:
    lines = parse_lrc(text)
    assert [line.start for line in lines] == sorted(line.start for line in lines)
    for line in lines:
        assert 0 <= line.start <= line.end and line.text and len(line.text) <= 500
        assert line.text == line.text.strip()


@given(
    st.lists(
        st.tuples(st.integers(0, 2), st.integers(0, 59), st.integers(0, 99), st.text("abc xyz", min_size=1)),
        max_size=20,
    )
)
def test_generated_lrc_round_trips_start_times(entries: list[tuple[int, int, int, str]]) -> None:
    text = "\n".join(f"[{m:02d}:{s:02d}.{c:02d}]{words}" for m, s, c, words in entries)
    expected = sorted(m * 60 + s + c / 100 for m, s, c, words in entries if words.strip())
    assert [round(line.start, 6) for line in parse_lrc(text)] == [round(t, 6) for t in expected]
