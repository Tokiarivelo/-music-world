"""`AnalyzeAudio` with fake stage ports: stage order, progress, caching, resume, and the requirement 7.2 property
that any stage output assembles into a valid `AnalysisResult`."""

from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from music_world.analysis.application.ports import Rhythm, Structure
from music_world.analysis.application.use_cases.analyze_audio import (
    STAGE_NAMES,
    STAGES,
    AnalyzeAudio,
    AnalyzeAudioInput,
    _rounded,
    assemble_result,
    stem_key,
)
from music_world.analysis.domain.audio import STEMS, DecodedAudio
from music_world.analysis.domain.errors import AudioMissingError, SeparationError
from music_world.analysis.domain.harmony import group_chords
from music_world.analysis.domain.lyrics import LyricLine
from music_world.analysis.domain.notes import RawNote, merge_stems
from tests.fakes import InMemoryAnalysisRepository, InMemoryObjectStore

HASH = "sha256:" + "cd" * 32
DURATION = 12.0


class FakeDecoder:
    async def decode(self, source: Path, target: Path) -> DecodedAudio:
        target.write_bytes(source.read_bytes())
        return DecodedAudio(target, 44100, 2, DURATION)


class FakeSeparator:
    def __init__(self, fail: bool = False) -> None:
        self.calls, self.fail = 0, fail

    async def separate(self, mix: DecodedAudio, out_dir: Path) -> dict[str, Path]:
        self.calls += 1
        if self.fail:
            raise SeparationError("boom")
        out = {}
        for stem in STEMS:
            out[stem] = out_dir / f"{stem}.flac"
            out[stem].write_bytes(stem.encode())
        return out


class FakeTranscriber:
    """C major triad on `other`, a bass note, a quiet vocal note (dropped by the velocity filter)."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def transcribe(self, stem_path: Path, stem: str) -> list[RawNote]:
        assert stem_path.read_bytes() == stem.encode()
        self.calls.append(stem)
        return {
            "other": [
                RawNote(1.0, 1.0, 60, 0.8, stem),
                RawNote(1.01, 1.0, 64, 0.8, stem),
                RawNote(1.02, 1.0, 67, 0.8, stem),
            ],
            "bass": [RawNote(1.0, 2.0, 36, 0.9, stem), RawNote(11.9, 1.0, 40, 0.9, stem)],  # second one is clamped
            "vocals": [RawNote(5.0, 0.5, 72, 0.1, stem)],
        }[stem]


class FakeRhythm:
    calls = 0

    async def analyze(self, mix: Path, drums: Path | None) -> Rhythm:
        FakeRhythm.calls += 1
        assert drums is not None and drums.name == "drums.flac"
        return Rhythm(120.0, (0.5, 1.0, 1.5), (0.5, 1.5), tuple(0.1 * (i % 10) for i in range(121)))


class FakeStructure:
    async def analyze(self, mix: Path) -> Structure:
        chroma = [0.1] * 12
        chroma[0], chroma[4], chroma[7] = 1.0, 0.8, 0.9
        return Structure(tuple(chroma), (6.0,), (0, 1))


class NoLyrics:
    async def transcribe(self, vocals: Path, duration_sec: float) -> list[LyricLine]:
        return []


class Recorder:
    def __init__(self) -> None:
        self.calls: list[tuple[float, str | None]] = []

    async def __call__(self, progress: float, stage: str | None = None) -> None:
        self.calls.append((progress, stage))


def make(
    separator: FakeSeparator | None = None,
) -> tuple[AnalyzeAudio, InMemoryAnalysisRepository, InMemoryObjectStore]:
    repo, store = InMemoryAnalysisRepository(), InMemoryObjectStore()
    store.objects["audio/x.wav"] = b"RIFF fake"
    use_case = AnalyzeAudio(
        repo, store, FakeDecoder(), separator or FakeSeparator(), FakeTranscriber(), FakeRhythm(), FakeStructure(),
        NoLyrics(), min_velocity=0.25,
    )  # fmt: skip
    return use_case, repo, store


INPUT = AnalyzeAudioInput(HASH, "audio/x.wav")


def test_stage_weights_sum_to_one() -> None:
    assert abs(sum(w for _, w in STAGES) - 1.0) < 1e-9 and len(set(STAGE_NAMES)) == len(STAGES)


async def test_pipeline_runs_every_stage_in_order_and_stores_a_valid_result() -> None:
    use_case, repo, store = make()
    progress = Recorder()
    result = await use_case.execute(INPUT, progress)
    assert [s for _, s in progress.calls] == list(STAGE_NAMES)
    values = [p for p, _ in progress.calls]
    assert values == sorted(values) and all(0 <= v < 1 for v in values)
    assert await repo.get(HASH) == result
    assert all(stem_key(HASH, s) in store.objects for s in STEMS)  # requirement 2.2
    assert result.key == "C major" and result.tempo_bpm == 120
    assert [(n.midi, n.stem) for n in result.notes] == [(36, "bass"), (60, "other"), (64, "other"), (67, "other"),
                                                       (40, "bass")]  # fmt: skip
    assert result.notes[-1].time + result.notes[-1].duration == DURATION  # clamped to the song
    assert [c.label for c in result.chords] == ["C"] and len(result.chords[0].note_ids) == 4
    assert [s.label for s in result.sections] and result.sections[-1].end == DURATION
    assert result.lyrics == [] and result.lyrics_source == "none"


async def test_a_cached_hash_returns_without_any_stage() -> None:
    use_case, repo, _ = make()
    first = await use_case.execute(INPUT, Recorder())
    progress = Recorder()
    assert await use_case.execute(INPUT, progress) == first and progress.calls == []


async def test_a_rerun_after_a_crash_reuses_stems_and_stage_checkpoints() -> None:
    separator = FakeSeparator()
    use_case, repo, store = make(separator)
    await use_case.execute(INPUT, Recorder())
    repo.results.clear()  # the result was lost, the checkpoints were not
    transcriber = FakeTranscriber()
    use_case._transcriber = transcriber
    before = FakeRhythm.calls
    again = await use_case.execute(INPUT, Recorder())
    assert separator.calls == 1 and transcriber.calls == [] and FakeRhythm.calls == before
    assert again == await repo.get(HASH)


async def test_missing_audio_and_stage_errors_propagate_without_a_result() -> None:
    use_case, repo, store = make(FakeSeparator(fail=True))
    with pytest.raises(SeparationError):
        await use_case.execute(INPUT, Recorder())
    assert repo.results == {}
    store.objects.clear()
    with pytest.raises(AudioMissingError):
        await use_case.execute(INPUT, Recorder())


raw_notes = st.lists(
    st.builds(
        RawNote,
        time=st.floats(min_value=0, max_value=30, allow_nan=False),
        duration=st.floats(min_value=0.001, max_value=5, allow_nan=False),
        midi=st.integers(0, 127),
        velocity=st.floats(min_value=0, max_value=1),
        stem=st.sampled_from(("other", "bass", "vocals")),
    ),
    max_size=80,
)
times = st.lists(st.floats(min_value=-5, max_value=40, allow_nan=False), max_size=30)


@settings(max_examples=200, deadline=None)
@given(
    raw_notes,
    st.floats(min_value=0.5, max_value=30),
    times,
    times,
    st.lists(st.floats(min_value=0, max_value=1), max_size=400),
    st.lists(st.floats(min_value=0, max_value=1), min_size=12, max_size=12),
    times,
    st.lists(st.integers(0, 3), max_size=30),
    st.lists(st.tuples(st.floats(min_value=-2, max_value=40), st.floats(0, 10), st.text(max_size=20)), max_size=8),
    st.floats(min_value=-10, max_value=500),
)
def test_any_stage_output_assembles_into_a_valid_analysis(
    notes: list[RawNote],
    duration: float,
    beats: list[float],
    kicks: list[float],
    rms: list[float],
    chroma: list[float],
    boundaries: list[float],
    clusters: list[int],
    lyric_raw: list[tuple[float, float, str]],
    tempo: float,
) -> None:
    from music_world.analysis.domain.harmony import estimate_key
    from music_world.analysis.domain.notes import fit_to_song

    duration = round(duration, 4)
    merged = merge_stems([_rounded(fit_to_song(notes, duration))])
    lyrics = [LyricLine(s, s + d, t) for s, d, t in lyric_raw]
    result = assemble_result(
        HASH, duration, merged, group_chords(merged), estimate_key(chroma),
        Rhythm(tempo, tuple(beats), tuple(kicks), tuple(rms)), Structure(tuple(chroma), tuple(boundaries),
        tuple(clusters)), lyrics,
    )  # fmt: skip
    assert result.duration_sec == duration  # (the model validator already enforced requirement 7.2)
    assert len(result.notes) == len(merged)


# --- Lyrics without a user .lrc: online catalog, then recognition, cached ---


class FakeLookup:
    def __init__(self, found: object = None) -> None:
        self.found, self.queries = found, []  # type: ignore[var-annotated]

    async def find(self, artist: str, title: str, duration_sec: float) -> object:
        self.queries.append((artist, title))
        return self.found


class FakeTags:
    async def read(self, audio: Path) -> tuple[str, str] | None:
        return ("Tag Artist", "Tag Title")


class CountingAsr:
    def __init__(self, lines: list[LyricLine]) -> None:
        self.lines, self.calls = lines, 0

    async def transcribe(self, vocals: Path, duration_sec: float) -> list[LyricLine]:
        self.calls += 1
        return self.lines


def _with_lyrics(lookup: object, asr: CountingAsr) -> tuple[AnalyzeAudio, InMemoryObjectStore]:
    repo, store = InMemoryAnalysisRepository(), InMemoryObjectStore()
    store.objects["audio/x.wav"] = b"RIFF fake"
    use_case = AnalyzeAudio(
        repo, store, FakeDecoder(), FakeSeparator(), FakeTranscriber(), FakeRhythm(), FakeStructure(),
        asr, min_velocity=0.25, lookup=lookup, tags=FakeTags(),
    )  # type: ignore[arg-type]  # fmt: skip
    return use_case, store


FOUND_LINES = tuple(LyricLine(2.0 * i, 2.0 * i + 1.5, f"line {i}") for i in range(1, 6))


async def test_found_lyrics_win_and_recognition_is_never_run() -> None:
    from music_world.analysis.application.ports import FoundLyrics

    lookup, asr = FakeLookup(FoundLyrics(FOUND_LINES)), CountingAsr([LyricLine(1, 2, "heard")])
    use_case, _ = _with_lyrics(lookup, asr)
    result = await use_case.execute(INPUT, Recorder())
    assert result.lyrics_source == "lrclib" and len(result.lyrics) == 5
    assert lookup.queries == [("Tag Artist", "Tag Title")] and asr.calls == 0


async def test_not_found_falls_back_to_recognition_and_the_outcome_is_cached() -> None:
    lookup, asr = FakeLookup(None), CountingAsr([LyricLine(1, 2, "heard one"), LyricLine(3, 4, "heard two")])
    use_case, store = _with_lyrics(lookup, asr)
    first = await use_case.execute(INPUT, Recorder())
    assert first.lyrics_source == "whisper" and [s.text for s in first.lyrics] == ["heard one", "heard two"]
    store.objects.pop(next(k for k in store.objects if k.startswith("work/") and k.endswith("/notes.json")), None)
    use_case._repo = InMemoryAnalysisRepository()  # type: ignore[attr-defined]  # force a second full run
    again = await use_case.execute(INPUT, Recorder())
    assert again.lyrics_source == "whisper" and asr.calls == 1 and len(lookup.queries) == 1  # nothing asked twice


async def test_a_user_lrc_skips_recognition_and_an_instrumental_catalog_entry_skips_it_too() -> None:
    from music_world.analysis.application.ports import FoundLyrics

    asr = CountingAsr([LyricLine(1, 2, "heard")])
    use_case, _ = _with_lyrics(FakeLookup(None), asr)
    skipped = await use_case.execute(AnalyzeAudioInput(HASH, "audio/x.wav", allow_asr=False), Recorder())
    assert skipped.lyrics == [] and skipped.lyrics_source == "none" and asr.calls == 0
    asr2 = CountingAsr([LyricLine(1, 2, "heard")])
    use_case2, _ = _with_lyrics(FakeLookup(FoundLyrics((), instrumental=True)), asr2)
    instrumental = await use_case2.execute(INPUT, Recorder())
    assert instrumental.lyrics == [] and asr2.calls == 0


async def test_search_lyrics_updates_the_stored_analysis_and_leaves_it_alone_when_nothing_is_found() -> None:
    from music_world.analysis.application.lyrics_finder import LyricsFinder
    from music_world.analysis.application.ports import ProjectAudio
    from music_world.analysis.application.use_cases.search_lyrics import SearchLyrics

    use_case, repo, store = make()
    await use_case.execute(INPUT, Recorder())  # the analysis exists, without lyrics
    before = await repo.get(HASH)
    assert before is not None and before.lyrics == []

    class Projects:
        async def get(self, project_id: str) -> ProjectAudio:
            return ProjectAudio(HASH, "audio/x.wav", None)

    nothing = SearchLyrics(Projects(), repo, store, LyricsFinder(store, None, None, CountingAsr([])))
    assert await nothing.execute("p") == 0 and (await repo.get(HASH)) == before

    heard = [LyricLine(1.0, 2.0, "first line"), LyricLine(3.0, 4.0, "second line"), LyricLine(5.0, 99.0, "late line")]
    store.objects.pop(next(k for k in store.objects if k.endswith("/lyrics.json")), None)
    found = SearchLyrics(Projects(), repo, store, LyricsFinder(store, None, None, CountingAsr(heard)))
    assert await found.execute("p") == 3
    after = await repo.get(HASH)
    assert after is not None and after.lyrics_source == "whisper" and after.notes == before.notes
    assert [s.text for s in after.lyrics] == ["first line", "second line", "late line"]
    assert after.lyrics[-1].end == DURATION  # clamped to the song


async def test_search_lyrics_uses_the_typed_artist_and_title_and_needs_no_vocal_stem_for_the_catalog() -> None:
    from music_world.analysis.application.lyrics_finder import LyricsFinder
    from music_world.analysis.application.ports import FoundLyrics, ProjectAudio
    from music_world.analysis.application.use_cases.search_lyrics import SearchLyrics, save_query

    use_case, repo, store = make()
    await use_case.execute(INPUT, Recorder())
    for key in [k for k in store.objects if "/stems/" in k or "vocals" in k]:
        store.objects.pop(key)  # no vocal stem: speech recognition is impossible

    class Projects:
        async def get(self, project_id: str) -> ProjectAudio:
            return ProjectAudio(HASH, "audio/x.wav", None)

    catalog = [LyricLine(float(i * 10), float(i * 10 + 5), f"line {i}") for i in range(1, 11)]
    lookup, asr = FakeLookup(FoundLyrics(tuple(catalog))), CountingAsr([])
    search = SearchLyrics(Projects(), repo, store, LyricsFinder(store, lookup, None, asr))
    assert await search.execute("p") == 0 and lookup.queries == []  # no tags and nothing typed: no query
    await save_query(store, HASH, " Eric Clapton ", "Layla")
    assert await search.execute("p") > 0
    assert lookup.queries == [("Eric Clapton", "Layla")] and asr.calls == 0


def test_guess_artist_title_reads_the_usual_file_names() -> None:
    from music_world.analysis.domain.lyrics import guess_artist_title

    assert guess_artist_title("Eric Clapton - Layla (Unplugged).mp3") == ("Eric Clapton", "Layla")
    assert guess_artist_title("01 - Eric_Clapton - Tears in Heaven [HD].flac") == ("Eric Clapton", "Tears in Heaven")
    assert guess_artist_title("C:\\music\\Artist - Song.wav") == ("Artist", "Song")
    assert guess_artist_title("recording.mp3") is None and guess_artist_title(" - x.mp3") is None


async def test_the_lookup_falls_back_on_the_upload_name_and_stretches_a_near_version() -> None:
    import json

    from music_world.analysis.application.lyrics_finder import LyricsFinder
    from music_world.analysis.application.ports import FoundLyrics

    store = InMemoryObjectStore()
    await store.put_bytes(
        f"work/{'a' * 64}/name-hint.json", json.dumps({"name": "Eric Clapton - Layla.mp3"}).encode(), "x"
    )
    catalog = tuple(LyricLine(float(i * 10), float(i * 10 + 5), f"line {i}") for i in range(1, 11))
    lookup = FakeLookup(FoundLyrics(catalog, duration=110.0))  # the catalog track is 110 s, the audio 100 s
    finder = LyricsFinder(store, lookup, None, CountingAsr([]))
    lines, source = await finder.find("sha256:" + "a" * 64, Path("x"), Path("v"), 100.0, allow_asr=False)
    assert source == "lrclib" and lookup.queries == [("Eric Clapton", "Layla")]
    assert lines[0].start == pytest.approx(10 * 100 / 110)
