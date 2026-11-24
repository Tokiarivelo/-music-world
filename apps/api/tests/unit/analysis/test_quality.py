from music_world.analysis.domain.quality import note_quality, scale_of


def test_scales_of_a_key() -> None:
    assert scale_of("A minor") == frozenset({9, 11, 0, 2, 4, 5, 7})
    assert scale_of("C major") == frozenset({0, 2, 4, 5, 7, 9, 11})
    assert scale_of("unknown") == frozenset()


def test_in_key_ratio_is_weighted_by_duration_and_counts_stems() -> None:
    notes = [(60, 3.0, "other"), (61, 1.0, "bass"), (64, 0.0, "other")]  # C and E in C major, C# out
    q = note_quality(notes, "C major", 10.0)
    assert q.notes == 3 and q.notes_per_second == 0.3
    assert q.in_key_ratio == 0.75
    assert q.per_stem == {"other": 2, "bass": 1}
    assert note_quality([], "C major", 10.0).in_key_ratio == 0.0
    assert note_quality(notes, "unknown", 10.0).in_key_ratio == 0.0
