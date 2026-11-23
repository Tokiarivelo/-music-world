"""The shipped demo (task 10) is a valid analysis of exactly the shipped audio file."""

import hashlib
import json
from pathlib import Path

from music_world.schemas.analysis import AnalysisResult

WEB = Path(__file__).resolve().parents[4] / "web"
AUDIO = WEB / "public/demo/neon-nocturne.mp3"
ANALYSIS = WEB / "src/features/player/demo/neon-nocturne.analysis.json"


def test_demo_analysis_matches_the_demo_audio_and_the_contract() -> None:
    result = AnalysisResult.model_validate(json.loads(ANALYSIS.read_text()))
    # Re-run `scripts/analyze_file.py` whenever the demo audio changes (see design.md § As built, task 10).
    assert result.audio_hash == "sha256:" + hashlib.sha256(AUDIO.read_bytes()).hexdigest()
    assert AUDIO.stat().st_size <= 2 * 1024 * 1024
    assert len(result.notes) >= 100 and result.chords and len(result.sections) >= 2
