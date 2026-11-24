import json
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from music_world.director.application.summary import ENERGY_POINTS, summarize
from music_world.director.application.template_output import parse_template, template_json_schema
from music_world.director.domain.demo import DEMO_AUDIO_HASH
from music_world.director.infrastructure.default_template import default_template
from music_world.director.infrastructure.prompts import PROMPT_VERSION, DirectorPromptSet
from music_world.director.infrastructure.providers.mock import mock_template
from music_world.schemas.analysis import AnalysisResult, LyricSegment
from tests.unit.director.helpers import demo_analysis, small_analysis

GEN = {"provider": "mock", "model": "mock-director-1", "promptVersion": PROMPT_VERSION}
WEB_DEFAULT = Path(__file__).resolve().parents[4] / "web/src/templates/default/neon-nocturne.json"


def test_summary_is_compact_deterministic_and_has_no_note_list() -> None:
    analysis = demo_analysis()
    summary = summarize(analysis)
    text = summary.text()
    assert summarize(analysis).text() == text and summary.digest() == summarize(analysis).digest()
    assert len(summary.energy_curve) == ENERGY_POINTS
    assert "n_0" not in text and len(text) < 4000  # never the raw notes
    assert summary.key in text and f"{summary.tempo_bpm:.0f} BPM" in text
    assert all(len(s.chords) <= 8 for s in summary.sections)
    assert summary.pitch_min <= summary.pitch_median <= summary.pitch_max


def test_summary_of_a_tiny_analysis_keeps_at_most_32_energy_points() -> None:
    summary = summarize(small_analysis())
    assert 1 <= len(summary.energy_curve) <= ENERGY_POINTS
    assert summary.sections[0].chords == ("C",) and summary.lyrics == ""


def test_lyrics_are_truncated_in_the_summary() -> None:
    doc = small_analysis().model_dump(by_alias=True)
    doc["lyrics"] = [LyricSegment(start=i, end=i + 0.5, text="la " * 100).model_dump() for i in range(9)]
    doc["lyricsSource"] = "lrc"
    summary = summarize(AnalysisResult.model_validate(doc))
    assert len(summary.lyrics) == 1500 and summary.lyric_lines == 9


def test_prompts_carry_schema_and_enums_and_repair_lists_errors() -> None:
    prompts = DirectorPromptSet()
    system = prompts.system(template_json_schema())
    assert '"WorldTemplate"' in system and "terrain_ridge" in system and "cracked_plate" in system
    summary = summarize(small_analysis())
    assert summary.text() in prompts.user(summary)
    assert "- palette: bad" in prompts.repair(summary, ["palette: bad"])
    assert prompts.version == PROMPT_VERSION


@settings(max_examples=60)
@given(
    key=st.sampled_from(["C major", "A minor", "F# minor", "Bb major"]),
    tempo=st.floats(0, 400),
    midi=st.lists(st.integers(0, 127), min_size=1, max_size=4),
)
def test_mock_templates_are_always_renderable_and_deterministic(key: str, tempo: float, midi: list[int]) -> None:
    doc = small_analysis(key=key, tempoBpm=tempo).model_dump(by_alias=True)
    for note, pitch in zip(doc["notes"], sorted(midi) + [72] * 4, strict=False):
        note["midi"] = pitch
    doc["notes"].sort(key=lambda n: (n["time"], n["midi"]))
    try:
        analysis = AnalysisResult.model_validate(doc)
    except ValueError:
        return  # chord invariants may break with random pitches: not this test's subject
    raw = mock_template(summarize(analysis))
    assert raw == mock_template(summarize(analysis))
    template, errors = parse_template(raw, template_id="ai-mock-00000000", generated_by=GEN)
    assert errors == [] and template is not None


def test_mock_follows_the_mood() -> None:
    minor = mock_template(summarize(small_analysis(key="A minor")))
    major = mock_template(summarize(small_analysis(key="C major")))
    assert minor["palette"] != major["palette"] and minor["name"].startswith("Cool")
    fast = mock_template(summarize(small_analysis(tempoBpm=160)))
    slow = mock_template(summarize(small_analysis(tempoBpm=60)))
    assert fast["staff"]["lookahead"] < slow["staff"]["lookahead"]


def test_default_template_copy_matches_the_web_default() -> None:
    assert default_template()["id"] == "neon-nocturne"
    web = json.loads(WEB_DEFAULT.read_text())
    stored = json.loads(
        (Path(__file__).resolve().parents[3] / "music_world/director/infrastructure/default_template.json").read_text()
    )
    assert stored == web


def test_demo_hash_constant_matches_the_shipped_demo() -> None:
    assert demo_analysis().audio_hash == DEMO_AUDIO_HASH
