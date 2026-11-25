"""Lyrics lookup on LRCLIB (https://lrclib.net), a free community catalog of synced lyrics. One short request per song,
only artist, title and duration leave the server; the answer is validated and never logged."""

import httpx
import structlog

from music_world.analysis.application.ports import FoundLyrics
from music_world.analysis.domain.lyrics import MAX_DURATION_DIFF_SEC, MAX_STRETCH_RATIO, LyricLine, parse_lrc

log = structlog.get_logger(__name__)

BASE_URL = "https://lrclib.net"
TIMEOUT_SECONDS = 6.0
USER_AGENT = "music-world-lyrics-lookup"  # generic: no contact details of the operator or the user


class LrclibLookup:
    def __init__(self, client: httpx.AsyncClient | None = None, base_url: str = BASE_URL) -> None:
        self._client = client
        self._base = base_url

    async def find(self, artist: str, title: str, duration_sec: float) -> FoundLyrics | None:
        params = {"artist_name": artist, "track_name": title, "duration": str(round(duration_sec))}
        try:
            if self._client is not None:
                return await self._query(self._client, params, duration_sec)
            async with httpx.AsyncClient(
                timeout=TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT}, follow_redirects=False
            ) as client:
                return await self._query(client, params, duration_sec)
        except (httpx.HTTPError, ValueError) as error:
            log.info("analysis.lyrics_lookup_failed", error=type(error).__name__)
            return None

    async def _query(
        self, client: httpx.AsyncClient, params: dict[str, str], duration_sec: float
    ) -> FoundLyrics | None:
        hit = await client.get(f"{self._base}/api/get", params=params)
        if hit.status_code == 200:
            found = _read(hit.json(), duration_sec)
            if found is not None:
                return found
        elif hit.status_code != 404:
            return None
        # Not an exact match: take the best synced result of a search whose length is close to the audio's.
        search = await client.get(
            f"{self._base}/api/search",
            params={"artist_name": params["artist_name"], "track_name": params["track_name"]},
        )
        if search.status_code != 200 or not isinstance(search.json(), list):
            return None
        candidates = [found for item in search.json()[:10] if (found := _read(item, duration_sec)) is not None]
        # The closest length first: an exact version beats a near one whose timings have to be stretched.
        candidates.sort(key=lambda found: abs((found.duration or duration_sec) - duration_sec))
        return candidates[0] if candidates else None


def _read(item: object, duration_sec: float) -> FoundLyrics | None:
    if not isinstance(item, dict):
        return None
    length = item.get("duration")
    stretch: float | None = None
    if isinstance(length, int | float) and abs(float(length) - duration_sec) > MAX_DURATION_DIFF_SEC:
        if duration_sec <= 0 or abs(float(length) - duration_sec) > MAX_STRETCH_RATIO * duration_sec:
            return None  # another version of the song: its timings would not match the audio
        stretch = float(length)
    if item.get("instrumental") is True:
        return FoundLyrics((), instrumental=True)
    synced = item.get("syncedLyrics")
    if not isinstance(synced, str) or not synced.strip():
        return None
    lines: list[LyricLine] = parse_lrc(synced)
    return FoundLyrics(tuple(lines), duration=stretch) if lines else None
