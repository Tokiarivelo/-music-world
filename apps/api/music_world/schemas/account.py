"""Accounts contracts: the signed-in session and the sign-in requests (06-template-store requirement 1)."""

from pydantic import ConfigDict, Field

from music_world.schemas.base import ContractModel

SESSION_SCHEMA_ID = "music-world.session.v1"


class SessionUser(ContractModel):
    id: str
    email: str = Field(description="Only ever returned to its owner.")
    display_name: str = Field(description="Public author name in the template store.")


class AuthSession(ContractModel):
    """`GET /api/auth/session` and `POST /api/auth/verify`: who is signed in (`user` is null when nobody is)."""

    model_config = ConfigDict(
        title="AuthSession",
        json_schema_extra={
            "examples": [
                {"user": {"id": "0193…", "email": "ada@example.com", "displayName": "creator-1a2b3c"}},
                {"user": None},
            ]
        },
    )

    user: SessionUser | None
    moderator: bool | None = Field(
        default=None, description="`true` only for a moderator; absent for everyone else (10-template-moderation)."
    )


class MagicLinkRequest(ContractModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"email": "ada@example.com"}]})

    email: str = Field(min_length=3, max_length=254)


class MagicLinkSent(ContractModel):
    status: str = Field(default="sent", description="Always `sent`, whether or not an account exists.")


class VerifyRequest(ContractModel):
    token: str = Field(min_length=1, max_length=128)
