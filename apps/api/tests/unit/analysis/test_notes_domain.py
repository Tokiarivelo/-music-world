"""Hypothesis properties of the note filters (requirements 3.2–3.4)."""

from hypothesis import given, settings
from hypothesis import strategies as st

from music_world.analysis.domain.notes import (
    MIN_NOTE_DURATION_SEC,
    RawNote,
    filter_notes,
    fit_to_song,
    merge_stems,
    sort_key,
)

STEMS = ("other", "bass", "vocals")

notes_st = st.builds(
    RawNote,
    time=st.floats(min_value=-1, max_value=200, allow_nan=False),
    duration=st.floats(min_value=0, max_value=10, allow_nan=False),
    midi=st.integers(-5, 135),
    velocity=st.floats(min_value=-0.2, max_value=1.2, allow_nan=False),
    stem=st.sampled_from(STEMS),
)


@given(st.lists(notes_st, max_size=60), st.floats(min_value=0, max_value=1))
def test_filter_keeps_order_and_only_long_loud_notes(notes: list[RawNote], min_velocity: float) -> None:
    kept = filter_notes(notes, min_velocity)
    assert all(n.duration >= MIN_NOTE_DURATION_SEC and n.velocity >= min_velocity for n in kept)
    # Order preserved: `kept` is a subsequence of `notes`, and nothing that passes the test is lost.
    it = iter(notes)
    assert all(any(k is n for n in it) for k in kept)
    assert len(kept) == sum(1 for n in notes if n.duration >= MIN_NOTE_DURATION_SEC and n.velocity >= min_velocity)


@given(st.lists(notes_st, max_size=60), st.floats(min_value=1, max_value=180))
def test_fit_to_song_yields_valid_notes_inside_the_song(notes: list[RawNote], duration: float) -> None:
    for n in fit_to_song(notes, duration):
        assert n.time >= 0 and n.time + n.duration <= duration + 1e-9
        assert n.duration >= MIN_NOTE_DURATION_SEC - 1e-9
        assert 0 <= n.midi <= 127 and 0 <= n.velocity <= 1


@given(st.lists(st.lists(notes_st, max_size=30), max_size=3), st.integers(1, 50))
def test_merge_is_sorted_unique_capped_and_keeps_the_loudest(per_stem: list[list[RawNote]], cap: int) -> None:
    merged = merge_stems(per_stem, max_notes=cap)
    assert [sort_key(n) for n in merged] == sorted(sort_key(n) for n in merged)
    keys = [(n.time, n.midi, n.stem) for n in merged]
    assert len(keys) == len(set(keys)) and len(merged) <= cap
    distinct = {(n.time, n.midi, n.stem) for notes in per_stem for n in notes}
    assert len(merged) == min(cap, len(distinct))
    if merged and len(distinct) > cap:
        dropped = [n for notes in per_stem for n in notes if (n.time, n.midi, n.stem) not in set(keys)]
        assert max(n.velocity for n in dropped) <= min(n.velocity for n in merged)


def test_merge_is_independent_of_stem_order() -> None:
    a = [RawNote(1.0, 0.5, 60, 0.8, "other"), RawNote(0.5, 0.5, 64, 0.8, "other")]
    b = [RawNote(1.0, 0.5, 60, 0.8, "bass")]
    assert merge_stems([a, b]) == merge_stems([b, a])
    assert [n.time for n in merge_stems([a, b])] == [0.5, 1.0, 1.0]


@given(st.lists(notes_st, max_size=60))
def test_join_fragments_leaves_no_close_same_pitch_pair_and_keeps_coverage(notes: list[RawNote]) -> None:
    from music_world.analysis.domain.notes import FRAGMENT_GAP_SEC, join_fragments

    joined = join_fragments(notes)
    assert [sort_key(n) for n in joined] == sorted(sort_key(n) for n in joined)
    by_voice: dict[tuple[str, int], list[RawNote]] = {}
    for n in joined:
        by_voice.setdefault((n.stem, n.midi), []).append(n)
    for voice in by_voice.values():
        for a, b in zip(voice, voice[1:], strict=False):
            assert b.time - (a.time + a.duration) >= FRAGMENT_GAP_SEC
    # Every input instant stays covered by a joined note of the same voice, and nothing new starts earlier.
    for n in notes:
        voice = by_voice[(n.stem, n.midi)]
        assert any(j.time <= n.time and n.time + n.duration <= j.time + j.duration + 1e-9 for j in voice)
    assert len(joined) <= len(notes)


def test_join_fragments_merges_a_split_note_only() -> None:
    from music_world.analysis.domain.notes import join_fragments

    split = [RawNote(0.5, 0.53, 60, 0.7, "other"), RawNote(1.03, 0.1, 60, 0.6, "other")]
    apart = [RawNote(0.5, 0.3, 60, 0.7, "other"), RawNote(1.0, 0.3, 60, 0.7, "other")]
    other_stem = [RawNote(0.5, 0.53, 60, 0.7, "other"), RawNote(1.03, 0.1, 60, 0.6, "bass")]
    (joined,) = join_fragments(split)
    assert (joined.time, round(joined.duration, 9), joined.velocity) == (0.5, 0.63, 0.7)
    assert join_fragments(apart) == apart and len(join_fragments(other_stem)) == 2


# --- Accuracy filters (11-editable-notes task 10) ---------------------------------------------------------------------

from music_world.analysis.domain.notes import (  # noqa: E402
    Chroma,
    clean_notes,
    enforce_monophony,
    remove_harmonic_ghosts,
    verify_with_chroma,
)


def _n(time: float, duration: float, midi: int, velocity: float = 0.7, stem: str = "other") -> RawNote:
    return RawNote(time=time, duration=duration, midi=midi, velocity=velocity, stem=stem)


def test_an_octave_ghost_under_a_louder_note_is_dropped_but_a_real_octave_is_kept() -> None:
    notes = [_n(1.0, 1.0, 48, 0.9), _n(1.0, 1.0, 60, 0.3), _n(1.0, 1.0, 55, 0.3)]
    assert [n.midi for n in remove_harmonic_ghosts(notes)] == [48, 55]  # 55 is not an overtone interval of 48 (7)
    # an octave played as loudly as the fundamental is music, not an overtone
    assert len(remove_harmonic_ghosts([_n(1.0, 1.0, 48, 0.8), _n(1.0, 1.0, 60, 0.7)])) == 2
    # no overlap in time: not an overtone
    assert len(remove_harmonic_ghosts([_n(1.0, 0.5, 48, 0.9), _n(3.0, 0.5, 60, 0.2)])) == 2
    # another stem: not an overtone of this one
    assert len(remove_harmonic_ghosts([_n(1.0, 1.0, 48, 0.9), _n(1.0, 1.0, 60, 0.2, stem="bass")])) == 2


def test_monophony_keeps_the_louder_of_two_simultaneous_notes_and_trims_a_short_overlap() -> None:
    together = enforce_monophony([_n(1.0, 1.0, 60, 0.4), _n(1.05, 1.0, 62, 0.8)])
    assert [n.midi for n in together] == [62]
    trimmed = enforce_monophony([_n(1.0, 1.0, 60, 0.5), _n(1.9, 1.0, 62, 0.5)])
    assert [(n.midi, round(n.duration, 3)) for n in trimmed] == [(60, 0.9), (62, 1.0)]
    assert enforce_monophony([]) == []


@settings(max_examples=60)
@given(
    st.lists(
        st.builds(
            RawNote,
            time=st.floats(0, 20),
            duration=st.floats(0.01, 3),
            midi=st.integers(30, 90),
            velocity=st.floats(0, 1),
            stem=st.just("vocals"),
        ),
        max_size=30,
    )
)
def test_monophony_never_leaves_two_overlapping_notes(notes: list[RawNote]) -> None:
    out = enforce_monophony(notes)
    for a, b in zip(out, out[1:], strict=False):
        assert a.time + a.duration <= b.time + 1e-9


def test_clean_notes_uses_the_stem_minimum_length_and_the_new_filters() -> None:
    vocals = [_n(1.0, 0.06, 60, 0.9, "vocals"), _n(2.0, 0.5, 62, 0.9, "vocals"), _n(2.1, 0.5, 64, 0.3, "vocals")]
    kept = clean_notes(vocals, 0.25, 10.0)
    assert [n.midi for n in kept] == [62]  # 0.06 s is too short for a voice; the quieter overlapping note is dropped
    assert len(clean_notes([_n(1.0, 0.06, 60, 0.9, "other")], 0.25, 10.0)) == 1  # an accompaniment figure keeps it


def test_chroma_check_drops_quiet_notes_the_mix_does_not_contain_only() -> None:
    c_major = [1.0 if pc in (0, 4, 7) else 0.05 for pc in range(12)]
    chroma = Chroma(hop_sec=0.1, frames=[c_major] * 50)
    notes = [
        _n(1.0, 1.0, 60, 0.4),  # C: in the mix
        _n(1.0, 1.0, 61, 0.4),  # C#: not in the mix, quiet -> dropped
        _n(1.0, 1.0, 62, 0.9),  # D: not in the mix but loud -> kept
    ]
    assert [n.midi for n in verify_with_chroma(notes, chroma)] == [60, 62]
    assert verify_with_chroma(notes, Chroma(0.1, [])) == notes  # no chroma: nothing is dropped
