"""User edits on top of an analysis (improvement I9): `music-world.edits.v1`. The analysis is never changed."""

from typing import Literal

from pydantic import Field

from music_world.schemas.base import ContractModel

SCHEMA_ID = "music-world.edits.v1"

HEX_PATTERN = r"^#[0-9a-fA-F]{6}$"
LINE_PATTERN = r"^[a-z0-9-]{1,32}$"


class StaffLine(ContractModel):
    """A voice line: a full staff with its own clef, color, height in the sky, mute and solo."""

    id: str = Field(pattern=LINE_PATTERN)
    name: str = Field(min_length=1, max_length=40)
    color: str | None = Field(default=None, pattern=HEX_PATTERN)
    clef: Literal["treble", "bass", "none"] = "treble"
    height: float = Field(default=0, ge=0, le=8, description="Extra height in staff gaps.")
    muted: bool = False
    solo: bool = False
    order: int = Field(default=0, ge=0, le=16)


class NoteEdit(ContractModel):
    note_id: str = Field(min_length=1, max_length=64)
    midi: int | None = Field(default=None, ge=21, le=108)
    time: float | None = Field(default=None, ge=0)
    duration: float | None = Field(default=None, gt=0, le=60)
    velocity: float | None = Field(default=None, ge=0, le=1)
    color: str | None = Field(default=None, pattern=HEX_PATTERN)
    line_id: str | None = Field(default=None, pattern=LINE_PATTERN)
    deleted: bool | None = None


class AddedNote(ContractModel):
    id: str = Field(pattern=r"^user:[0-9]{1,5}$")
    time: float = Field(ge=0)
    duration: float = Field(gt=0, le=60)
    midi: int = Field(ge=21, le=108)
    velocity: float = Field(ge=0, le=1)
    line_id: str = Field(pattern=LINE_PATTERN)
    color: str | None = Field(default=None, pattern=HEX_PATTERN)


class LayoutEdits(ContractModel):
    version: Literal[1] = 1
    lines: list[StaffLine] = Field(default_factory=list, max_length=8)
    notes: list[NoteEdit] = Field(default_factory=list, max_length=2000)
    added: list[AddedNote] = Field(default_factory=list, max_length=2000)
