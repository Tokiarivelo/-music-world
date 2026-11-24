"""Sections and energy (requirements 4.3, 4.4, 7.2)."""

from hypothesis import given
from hypothesis import strategies as st

from music_world.analysis.domain.structure import (
    MIN_SECTION_SEC,
    build_segments,
    label_sections,
    normalize_energy,
)

LABEL_RE = r"^(intro|verse|chorus|bridge|outro|section_\d+)$"


@given(
    st.lists(st.floats(min_value=-10, max_value=200, allow_nan=False), max_size=12),
    st.lists(st.integers(0, 4), max_size=14),
    st.floats(min_value=1, max_value=300),
)
def test_sections_are_contiguous_cover_the_song_and_have_valid_labels(
    boundaries: list[float], clusters: list[int], duration: float
) -> None:
    import re

    segments = build_segments(boundaries, clusters, duration)
    sections = label_sections(segments, duration)
    assert sections[0].start == 0 and sections[-1].end == duration
    for prev, cur in zip(sections, sections[1:], strict=False):
        assert cur.start == prev.end
    for s in sections:
        assert s.start < s.end and re.match(LABEL_RE, s.label)
        if len(sections) > 1:
            assert s.end - s.start >= MIN_SECTION_SEC - 1e-9


def test_repetition_labels_a_pop_form() -> None:
    # intro A B A B C B outro over 100 s.
    cuts = [5, 20, 35, 50, 65, 75, 90]
    clusters = [9, 1, 2, 1, 2, 3, 2, 8]
    labels = [s.label for s in label_sections(build_segments(cuts, clusters, 100), 100)]
    assert labels == ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]


def test_single_segment_song() -> None:
    sections = label_sections(build_segments([], [], 8.0), 8.0)
    assert [(s.start, s.end) for s in sections] == [(0.0, 8.0)] and sections[0].label == "section_0"


@given(
    st.lists(st.floats(min_value=0, max_value=10, allow_nan=False), max_size=200),
    st.floats(min_value=0.5, max_value=30),
)
def test_energy_is_normalised_inside_the_song(rms: list[float], duration: float) -> None:
    points = normalize_energy(rms, duration)
    assert all(0 <= p.value <= 1 and 0 <= p.time <= duration for p in points)
    assert [p.time for p in points] == sorted(p.time for p in points)
    if any(v > 0 for v in rms[: len(points)]) and max(rms[: len(points)]) == max(rms, default=0):
        assert max(p.value for p in points) == 1.0
