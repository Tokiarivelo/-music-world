import re
from pathlib import Path

from music_world.analysis.application.use_cases.analyze_audio import STAGE_NAMES

WEB_CONSTS = Path(__file__).resolve().parents[4] / "web/src/features/upload/consts/upload.consts.ts"


def test_web_progress_bar_lists_the_same_stages_in_the_same_order() -> None:
    assert tuple(re.findall(r"\{ id: '([a-z]+)'", WEB_CONSTS.read_text())) == STAGE_NAMES
