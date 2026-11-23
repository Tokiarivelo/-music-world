"""Chords and key (requirements 4.2, 5.1, 5.2): examples plus Hypothesis invariants."""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from music_world.analysis.domain.harmony import (
    CHORD_ONSET_WINDOW_SEC,
    MAJOR_PROFILE,
    MINOR_PROFILE,
    NO_CHORD,
    estimate_key,
    group_chords,
    label_chord,
)
from music_world.analysis.domain.notes import RawNote


def n(time: float, midi: int, duration: float = 1.0) -> RawNote:
    return RawNote(time, duration, midi, 0.8, "other")


@pytest.mark.parametrize(
    ("pcs", "bass", "label"),
    [
        ({0, 4, 7}, 0, "C"),
        ({9, 0, 4}, 9, "Am"),
        ({7, 11, 2, 5}, 7, "G7"),
        ({0, 4, 7, 11}, 0, "Cmaj7"),
        ({2, 5, 9, 0}, 2, "Dm7"),
        ({11, 2, 5}, 11, "Bdim"),
        ({0, 4, 8}, 0, "Caug"),
        ({0, 5, 7}, 0, "Csus4"),
        ({0, 1, 2}, 0, NO_CHORD),
        ({0, 6}, 0, NO_CHORD),
    ],
)
def test_label_chord(pcs: set[int], bass: int, label: str) -> None:
    assert label_chord(pcs, bass) == label


def test_bass_note_picks_the_root_of_ambiguous_sets() -> None:
    # {A, C, E, G} is both Am7 and C6: the bass decides.
    assert label_chord({9, 0, 4, 7}, 9) == "Am7"
    assert label_chord({9, 0, 4, 7}, 0) == "C6"


def test_stacked_c_e_g_is_one_c_chord() -> None:
    notes = [n(1.0, 60), n(1.01, 64), n(1.02, 67), n(3.0, 72)]
    chords = group_chords(notes)
    assert [(c.note_indices, c.label) for c in chords] == [((0, 1, 2), "C")]


def test_sequential_or_non_overlapping_notes_are_not_chords() -> None:
    arpeggio = [n(0.0, 60, 0.3), n(0.5, 64, 0.3), n(1.0, 67, 0.3)]
    late = [n(0.0, 60), n(0.0, 64), n(0.2, 67)]  # third starts 200 ms later
    short = [n(0.0, 60, 0.01), n(0.03, 64), n(0.03, 67)]  # first ends before the others start
    two_pcs = [n(0.0, 60), n(0.0, 72), n(0.0, 67)]
    for notes in (arpeggio, late, short, two_pcs):
        assert group_chords(notes) == []


notes_st = st.lists(
    st.builds(
        RawNote,
        time=st.floats(min_value=0, max_value=5).map(lambda t: round(t, 2)),
        duration=st.floats(min_value=0.01, max_value=2),
        midi=st.integers(36, 84),
        velocity=st.just(0.8),
        stem=st.sampled_from(("other", "bass")),
    ),
    max_size=40,
)


@given(notes_st)
def test_chords_only_group_overlapping_notes_that_start_together(notes: list[RawNote]) -> None:
    seen: set[int] = set()
    for chord in group_chords(notes):
        members = [notes[i] for i in chord.note_indices]
        assert seen.isdisjoint(chord.note_indices)
        seen.update(chord.note_indices)
        assert len({m.midi % 12 for m in members}) >= 3
        starts = [m.time for m in members]
        assert max(starts) - min(starts) <= CHORD_ONSET_WINDOW_SEC + 1e-9
        assert max(starts) < min(m.time + m.duration for m in members)
        assert chord.label == label_chord({m.midi % 12 for m in members}, min(m.midi for m in members) % 12)


@given(notes_st)
def test_grouping_does_not_depend_on_input_order(notes: list[RawNote]) -> None:
    def as_sets(ns: list[RawNote]) -> set[tuple[tuple[float, float, int, str], ...]]:
        return {
            tuple(sorted((ns[i].time, ns[i].duration, ns[i].midi, ns[i].stem) for i in c.note_indices))
            for c in group_chords(ns)
        }

    assert as_sets(notes) == as_sets(list(reversed(notes)))


@pytest.mark.parametrize(("tonic", "name"), [(0, "C"), (9, "A"), (7, "G"), (3, "Eb")])
def test_key_profiles_recover_their_own_key(tonic: int, name: str) -> None:
    major = [MAJOR_PROFILE[(i - tonic) % 12] for i in range(12)]
    minor = [MINOR_PROFILE[(i - tonic) % 12] for i in range(12)]
    assert estimate_key(major) == f"{name} major"
    assert estimate_key(minor) == f"{name} minor"


def test_a_minor_triad_heavy_chroma_is_a_minor_and_silence_is_unknown() -> None:
    chroma = [0.0] * 12
    for pc, w in ((9, 1.0), (0, 0.8), (4, 0.9), (2, 0.3), (7, 0.3), (5, 0.2), (11, 0.2)):
        chroma[pc] = w
    assert estimate_key(chroma) == "A minor"
    assert estimate_key([0.0] * 12) == "unknown"
    assert estimate_key([1.0] * 12) == "unknown"
