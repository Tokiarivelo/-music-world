"""SQLAlchemy adapters of the accounts ports (tables from migration `0003_accounts_templates`)."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Uuid, delete, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from music_world.accounts.domain.model import LoginToken, Session, User
from music_world.shared.db import Base


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    display_name: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuthTokenRow(Base):
    __tablename__ = "auth_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(254))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SessionRow(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def _user(row: UserRow) -> User:
    return User(str(row.id), row.email, row.display_name, _utc(row.created_at))


class SqlAlchemyUserRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def get(self, user_id: str) -> User | None:
        async with self._sessions() as s:
            row = await s.get(UserRow, user_id)
            return _user(row) if row else None

    async def get_by_email(self, email: str) -> User | None:
        async with self._sessions() as s:
            row = (await s.execute(UserRow.__table__.select().where(UserRow.email == email))).first()
            return User(str(row.id), row.email, row.display_name, _utc(row.created_at)) if row else None

    async def add(self, user: User) -> None:
        async with self._sessions.begin() as s:
            s.add(UserRow(id=user.id, email=user.email, display_name=user.display_name, created_at=user.created_at))


class SqlAlchemyLoginTokenRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def add(self, token: LoginToken) -> None:
        async with self._sessions.begin() as s:
            s.add(
                AuthTokenRow(
                    token_hash=token.token_hash,
                    email=token.email,
                    expires_at=token.expires_at,
                    used_at=None,
                    created_at=token.created_at,
                )
            )

    async def consume(self, token_hash: str, now: datetime) -> str | None:
        # One statement: two concurrent verifications of the same token cannot both succeed.
        statement = (
            update(AuthTokenRow)
            .where(
                AuthTokenRow.token_hash == token_hash,
                AuthTokenRow.used_at.is_(None),
                AuthTokenRow.expires_at > now,
            )
            .values(used_at=now)
            .returning(AuthTokenRow.email)
        )
        async with self._sessions.begin() as s:
            email = (await s.execute(statement)).scalar_one_or_none()
            return str(email) if email is not None else None


class SqlAlchemySessionRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def add(self, session: Session) -> None:
        async with self._sessions.begin() as s:
            s.add(
                SessionRow(
                    token_hash=session.token_hash,
                    user_id=session.user_id,
                    expires_at=session.expires_at,
                    created_at=session.created_at,
                )
            )

    async def get(self, token_hash: str) -> Session | None:
        async with self._sessions() as s:
            row = await s.get(SessionRow, token_hash)
            if row is None:
                return None
            return Session(row.token_hash, str(row.user_id), _utc(row.expires_at), _utc(row.created_at))

    async def delete(self, token_hash: str) -> None:
        async with self._sessions.begin() as s:
            await s.execute(delete(SessionRow).where(SessionRow.token_hash == token_hash))
