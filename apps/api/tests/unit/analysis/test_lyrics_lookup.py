import httpx
import numpy as np

from music_world.analysis.domain.lyrics import LyricLine, clean_asr_lines, is_plausible_lyrics
from music_world.analysis.infrastructure.lrclib_lookup import LrclibLookup
from music_world.analysis.infrastructure.whisper_lyrics import vocal_activity

LRC = "\n".join(f"[{m:02d}:{s:02d}.00]line {m}{s}" for m, s in [(0, 10), (0, 20), (0, 30), (0, 40), (0, 50), (1, 0)])


def _client(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=handler, base_url="https://lrclib.net")


async def test_exact_match_returns_synced_lines_and_sends_only_artist_title_duration() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"duration": 120.4, "syncedLyrics": LRC, "plainLyrics": "x"})

    found = await LrclibLookup(_client(httpx.MockTransport(handler))).find("An Artist", "A Title", 120.0)
    assert found is not None and len(found.lines) == 6 and not found.instrumental
    assert set(seen[0].url.params.keys()) == {"artist_name", "track_name", "duration"}


async def test_another_version_of_the_song_is_refused_and_search_is_the_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/get":
            return httpx.Response(404, json={})
        return httpx.Response(
            200,
            json=[
                {"duration": 300.0, "syncedLyrics": LRC},  # a live version: wrong length
                {"duration": 121.0, "syncedLyrics": None},  # no synced lyrics
                {"duration": 119.0, "syncedLyrics": LRC},
            ],
        )

    found = await LrclibLookup(_client(httpx.MockTransport(handler))).find("A", "T", 120.0)
    assert found is not None and len(found.lines) == 6


async def test_instrumental_unreachable_and_errors_give_a_clear_answer() -> None:
    instrumental = httpx.MockTransport(lambda r: httpx.Response(200, json={"duration": 120, "instrumental": True}))
    found = await LrclibLookup(_client(instrumental)).find("A", "T", 120.0)
    assert found is not None and found.instrumental and found.lines == ()

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    assert await LrclibLookup(_client(httpx.MockTransport(boom))).find("A", "T", 120.0) is None
    server_error = httpx.MockTransport(lambda r: httpx.Response(500))
    assert await LrclibLookup(_client(server_error)).find("A", "T", 120.0) is None


def test_plausible_lyrics_need_enough_lines_spread_over_the_song() -> None:
    spread = [LyricLine(10.0 * i, 10.0 * i + 4, "x") for i in range(1, 8)]
    assert is_plausible_lyrics(spread, 100.0)
    assert not is_plausible_lyrics(spread[:3], 100.0)  # a stub
    bunched = [LyricLine(1.0 + 0.1 * i, 2.0, "x") for i in range(8)]
    assert not is_plausible_lyrics(bunched, 100.0)  # all in the first seconds
    assert not is_plausible_lyrics(spread, 0.0)


def test_asr_output_is_cleaned_of_empty_symbol_only_and_looping_lines() -> None:
    raw = [LyricLine(0, 1, "  "), LyricLine(1, 2, "♪"), LyricLine(2, 3, "la la"), LyricLine(3, 4, "La la"),
           LyricLine(4, 5, "la la"), LyricLine(5, 6, "la la"), LyricLine(6, 7, "another line")]  # fmt: skip
    out = clean_asr_lines(raw)
    assert [line.text for line in out] == ["la la", "La la", "another line"]


def test_vocal_activity_separates_silence_from_singing() -> None:
    rate = 8000
    silence = np.zeros(rate * 4, dtype=np.float32)
    sung = (0.3 * np.sin(2 * np.pi * 220 * np.arange(rate * 4) / rate)).astype(np.float32)
    assert vocal_activity(silence, rate) == 0.0
    assert vocal_activity(sung, rate) > 0.95
    half = np.concatenate([sung[: rate * 2], silence[: rate * 2]])
    assert 0.4 < vocal_activity(half, rate) < 0.6
    assert vocal_activity(np.zeros(10, dtype=np.float32), rate) == 0.0
