"""`music-world.analysis.v1`: valid results pass, every requirement 7.2 violation is rejected."""

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from music_world.schemas.analysis import AnalysisResult

WEB_FIXTURE = Path(__file__).resolve().parents[3] / "web/src/engine/__fixtures__/demo-analysis.json"
HASH = "sha256:" + "ab" * 32


@st.composite
def valid_results(draw: st.DrawFn) -> dict[str, Any]:
    duration = draw(st.floats(min_value=1.0, max_value=180.0))
    raw = draw(
        st.lists(
            st.tuples(
                st.floats(min_value=0, max_value=0.94),
                st.floats(min_value=0.01, max_value=0.05),
                st.integers(0, 127),
            ),
            max_size=40,
        )
    )
    by_onset = {(round(f * duration, 4), m): round(d * duration, 4) for f, d, m in raw}
    triples = [(t, d, m) for (t, m), d in sorted(by_onset.items())]
    notes = [
        {"id": f"n_{i:04d}", "time": t, "duration": d, "midi": m, "velocity": 0.5, "stem": "other", "chordId": None}
        for i, (t, d, m) in enumerate(triples)
    ]
    chords: list[dict[str, Any]] = []
    # One chord on the first three notes when they start together and overlap.
    if len(notes) >= 3:
        head = notes[:3]
        same_start = max(n["time"] for n in head) - min(n["time"] for n in head) <= 0.06
        overlap = max(n["time"] for n in head) < min(n["time"] + n["duration"] for n in head)
        if same_start and overlap:
            for n in head:
                n["chordId"] = "c_0"
            start = min(n["time"] for n in head)
            chords.append(
                {
                    "id": "c_0",
                    "time": start,
                    "duration": max(n["time"] + n["duration"] for n in head) - start,
                    "label": "N.C.",
                    "noteIds": [n["id"] for n in head],
                }
            )
    cuts = sorted(set(draw(st.lists(st.floats(min_value=0.05, max_value=0.95), max_size=5))))
    bounds = [0.0, *[round(c * duration, 4) for c in cuts], duration]
    bounds = [b for i, b in enumerate(bounds) if i == 0 or b > bounds[i - 1]]
    if bounds[-1] != duration:
        bounds[-1] = duration
    sections = [
        {"start": a, "end": b, "label": f"section_{i}"}
        for i, (a, b) in enumerate(zip(bounds, bounds[1:], strict=False))
    ]
    beats = sorted(draw(st.lists(st.floats(min_value=0, max_value=duration), max_size=20)))
    energy = [{"time": i / 10, "value": 0.5} for i in range(int(duration * 10) + 1) if i / 10 <= duration]
    return {
        "schema": "music-world.analysis.v1",
        "audioHash": HASH,
        "durationSec": duration,
        "tempoBpm": 120,
        "beats": beats,
        "key": "A minor",
        "notes": notes,
        "chords": chords,
        "energy": energy,
        "sections": sections,
        "lyrics": [],
        "lyricsSource": "none",
    }


@settings(max_examples=150)
@given(valid_results())
def test_any_well_formed_result_validates(doc: dict[str, Any]) -> None:
    result = AnalysisResult.model_validate(doc)
    assert result.model_dump(by_alias=True)["schema"] == "music-world.analysis.v1"
    # Round trip through JSON keeps it valid.
    assert AnalysisResult.model_validate_json(result.model_dump_json(by_alias=True)) == result


def _swap_first_notes(d: dict[str, Any]) -> None:
    d["notes"][0], d["notes"][1] = d["notes"][1], d["notes"][0]


MUTATIONS = {
    "unsorted notes": _swap_first_notes,
    "note past the end": lambda d: d["notes"][-1].update(time=d["durationSec"]),
    "zero duration": lambda d: d["notes"][0].update(duration=0),
    "midi out of range": lambda d: d["notes"][0].update(midi=128),
    "duplicate note id": lambda d: d["notes"][1].update(id=d["notes"][0]["id"]),
    "chord unknown note": lambda d: d["chords"][0]["noteIds"].__setitem__(0, "n_9999"),
    "note unknown chord": lambda d: d["notes"][-1].update(chordId="c_42"),
    "chord member not pointing back": lambda d: d["notes"][0].update(chordId=None),
    "chord onsets too far apart": lambda d: d["notes"][2].update(time=d["notes"][0]["time"] + 0.2),
    "chord notes not overlapping": lambda d: d["notes"][0].update(duration=0.01),
    "zero-length section": lambda d: d["sections"].insert(1, {"start": 4.0, "end": 4.0, "label": "verse"}),
    "gap between sections": lambda d: d["sections"][1].update(start=d["sections"][0]["end"] + 0.5),
    "sections not covering": lambda d: d["sections"][-1].update(end=d["durationSec"] - 1),
    "sections not starting at 0": lambda d: d["sections"][0].update(start=0.5),
    "beats unsorted": lambda d: d.update(beats=[2.0, 1.0]),
    "beat after the end": lambda d: d.update(beats=[d["durationSec"] + 0.5]),
    "energy above 1": lambda d: d["energy"][0].update(value=1.5),
    "lyrics with source none": lambda d: d.update(lyrics=[{"start": 1, "end": 2, "text": "la"}]),
    "unknown field": lambda d: d.update(extra=1),
    "bad hash": lambda d: d.update(audioHash="md5:abc"),
    "bad key": lambda d: d.update(key="H major"),
}


def _note(i: int, time: float, midi: int, chord: str | None = None) -> dict[str, Any]:
    return {
        "id": f"n_{i:04d}",
        "time": time,
        "duration": 1.0,
        "midi": midi,
        "velocity": 0.7,
        "stem": "other",
        "chordId": chord,
    }


def _base() -> dict[str, Any]:
    """C major chord on the first three notes, a melody note, two sections."""
    return {
        "schema": "music-world.analysis.v1",
        "audioHash": HASH,
        "durationSec": 10.0,
        "tempoBpm": 120,
        "beats": [0.5, 1.0, 1.5],
        "key": "C major",
        "notes": [_note(0, 1.0, 60, "c_0"), _note(1, 1.0, 64, "c_0"), _note(2, 1.02, 67, "c_0"), _note(3, 5.0, 72)],
        "chords": [
            {"id": "c_0", "time": 1.0, "duration": 1.02, "label": "C", "noteIds": ["n_0000", "n_0001", "n_0002"]}
        ],
        "energy": [{"time": 0.0, "value": 0.1}, {"time": 0.1, "value": 0.2}],
        "sections": [{"start": 0, "end": 4.0, "label": "intro"}, {"start": 4.0, "end": 10.0, "label": "verse"}],
        "lyrics": [],
        "lyricsSource": "none",
    }


def test_web_engine_fixture_is_a_valid_analysis() -> None:
    result = AnalysisResult.model_validate(json.loads(WEB_FIXTURE.read_text()))
    assert len(result.notes) >= 50 and len(result.chords) == 8


def test_mutation_base_is_valid() -> None:
    AnalysisResult.model_validate(_base())


@pytest.mark.parametrize("name", sorted(MUTATIONS))
def test_invariant_violations_are_rejected(name: str) -> None:
    doc = copy.deepcopy(_base())
    MUTATIONS[name](doc)
    with pytest.raises(ValidationError):
        AnalysisResult.model_validate(doc)
