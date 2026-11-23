import asyncio

from alembic import context
from sqlalchemy.engine import Connection

import music_world.analysis.infrastructure.sqlalchemy_analysis_repository  # noqa: F401  (registers tables)
import music_world.projects.infrastructure.sqlalchemy_job_repository  # noqa: F401
import music_world.projects.infrastructure.sqlalchemy_project_repository  # noqa: F401
from music_world.shared.db import Base, create_engine
from music_world.shared.settings import get_settings

target_metadata = Base.metadata


def _run(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def _run_online() -> None:
    engine = create_engine(get_settings().database_url)
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=get_settings().database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(_run_online())
