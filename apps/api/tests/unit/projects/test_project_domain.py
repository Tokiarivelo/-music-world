import contextlib

import pytest
from hypothesis import given
from hypothesis import strategies as st

from music_world.projects.domain.errors import (
    AudioFormatUnsupportedError,
    AudioTooLargeError,
    AudioTooLongError,
    LyricsFileInvalidError,
)
from music_world.projects.domain.project import (
    MAX_AUDIO_BYTES,
    MAX_LRC_BYTES,
    check_audio_duration,
    check_audio_size,
    decode_lrc,
    sniff_audio_format,
)
from tests.fakes import wav_bytes


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (wav_bytes()[:12], "wav"),
        (b"fLaC\x00\x00\x00\x22" + b"\x00" * 4, "flac"),
        (b"ID3\x04\x00\x00" + b"\x00" * 6, "mp3"),
        (bytes([0xFF, 0xFB, 0x90, 0x00]) + b"\x00" * 8, "mp3"),  # MPEG-1 layer III frame
        (bytes([0xFF, 0xF3, 0x90, 0x00]) + b"\x00" * 8, "mp3"),  # MPEG-2 layer III frame
    ],
)
def test_known_containers_are_detected_by_content(header: bytes, expected: str) -> None:
    assert sniff_audio_format(header) == expected


@pytest.mark.parametrize(
    "header",
    [
        b"OggS\x00\x02" + b"\x00" * 6,  # Ogg Vorbis
        b"\x00\x00\x00\x20ftypM4A ",  # AAC in MP4
        b"RIFF\x00\x00\x00\x00AVI ",  # RIFF but not WAVE
        bytes([0xFF, 0xF1, 0x50, 0x80]) + b"\x00" * 8,  # ADTS AAC (layer bits 00)
        bytes([0xFF, 0xEB, 0x90, 0x00]) + b"\x00" * 8,  # reserved MPEG version
        b"<html><body>",
        b"",
    ],
)
def test_other_content_is_rejected(header: bytes) -> None:
    with pytest.raises(AudioFormatUnsupportedError):
        sniff_audio_format(header)


@given(st.binary(max_size=12))
def test_sniffing_never_crashes_and_only_returns_known_formats(header: bytes) -> None:
    with contextlib.suppress(AudioFormatUnsupportedError):
        assert sniff_audio_format(header) in ("mp3", "wav", "flac")


def test_size_and_duration_limits_are_inclusive() -> None:
    check_audio_size(MAX_AUDIO_BYTES)
    check_audio_duration(180.0)
    with pytest.raises(AudioTooLargeError):
        check_audio_size(MAX_AUDIO_BYTES + 1)
    with pytest.raises(AudioTooLongError):
        check_audio_duration(180.01)


def test_lrc_must_be_small_utf8_text() -> None:
    assert decode_lrc("﻿[00:01.00]hello".encode()) == "[00:01.00]hello"
    for bad in (b"\xff\xfe\x00bad", b"a\x00b", b"x" * (MAX_LRC_BYTES + 1)):
        with pytest.raises(LyricsFileInvalidError):
            decode_lrc(bad)
