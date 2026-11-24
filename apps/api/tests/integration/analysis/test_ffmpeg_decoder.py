import shutil
import subprocess
import wave
from pathlib import Path

import pytest

from music_world.analysis.domain.audio import MIX_CHANNELS, MIX_SAMPLE_RATE
from music_world.analysis.domain.errors import AudioDecodeError
from music_world.analysis.infrastructure.ffmpeg_decoder import FfmpegDecoder
from tests.fakes import wav_bytes

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


async def test_mono_8k_wav_becomes_44k_stereo_with_the_same_duration(tmp_path: Path) -> None:
    src = tmp_path / "in.wav"
    src.write_bytes(wav_bytes(seconds=1.5, sample_rate=8000))
    decoded = await FfmpegDecoder().decode(src, tmp_path / "out" / "mix.wav")
    assert (decoded.sample_rate, decoded.channels) == (MIX_SAMPLE_RATE, MIX_CHANNELS)
    assert abs(decoded.duration_sec - 1.5) < 0.01
    with wave.open(str(decoded.path)) as w:
        assert w.getframerate() == MIX_SAMPLE_RATE and w.getnchannels() == 2


async def test_flac_and_mp3_are_decoded(tmp_path: Path) -> None:
    src = tmp_path / "in.wav"
    src.write_bytes(wav_bytes(seconds=1.0))
    for ext in ("flac", "mp3"):
        encoded = tmp_path / f"in.{ext}"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), str(encoded)], check=True)
        decoded = await FfmpegDecoder().decode(encoded, tmp_path / f"{ext}.wav")
        assert abs(decoded.duration_sec - 1.0) < 0.1


async def test_garbage_is_a_decode_error(tmp_path: Path) -> None:
    src = tmp_path / "bad.mp3"
    src.write_bytes(b"ID3" + b"\x00" * 200)
    with pytest.raises(AudioDecodeError):
        await FfmpegDecoder().decode(src, tmp_path / "mix.wav")


async def test_a_song_longer_than_five_minutes_is_cut_to_five_minutes(tmp_path: Path) -> None:
    src = tmp_path / "long.wav"
    src.write_bytes(wav_bytes(seconds=301, sample_rate=1000))
    decoded = await FfmpegDecoder().decode(src, tmp_path / "mix.wav")
    assert abs(decoded.duration_sec - 300.0) < 0.1
