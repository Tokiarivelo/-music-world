from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime

import pytest

from music_world.projects.infrastructure.sqlalchemy_song_repository import Song, SqlAlchemySongRepository
from music_world.shared.db import Base, create_engine, create_session_factory
from music_world.shared.ids import uuid7


@pytest.fixture
async def repo() -> AsyncIterator[SqlAlchemySongRepository]:
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield SqlAlchemySongRepository(create_session_factory(engine))
    await engine.dispose()


def _song(slug: str, *, public: bool = True, digest: str = "a") -> Song:
    return Song(
        id=uuid7(), slug=slug, title=slug.title(), artist="Artist", license="Free To Use (credit required)",
        source_url=None, is_public=public, audio_hash="sha256:" + digest * 64, audio_key=f"audio/{slug}.mp3",
        audio_format="mp3", duration_sec=120.0, project_id=None, musical_key="A minor", tempo_bpm=100.0,
        note_count=900, pipeline_version="notes-v2", created_at=datetime(2026, 11, 24, tzinfo=UTC),
    )  # fmt: skip


async def test_upsert_is_rerunnable_and_listing_hides_private_songs(repo: SqlAlchemySongRepository) -> None:
    await repo.upsert(_song("b-song", digest="b"))
    await repo.upsert(_song("a-song", digest="a"))
    await repo.upsert(_song("secret", public=False, digest="c"))
    first = await repo.get_by_slug("a-song")
    assert first is not None
    await repo.upsert(replace(first, note_count=1200, musical_key="C major"))  # same slug: updated, not duplicated
    again = await repo.get_by_slug("a-song")
    assert again is not None and again.note_count == 1200 and again.id == first.id
    assert [s.slug for s in await repo.list_public()] == ["a-song", "b-song"]
    assert (await repo.get_by_slug("secret")) is not None
    assert await repo.get_by_slug("missing") is None
