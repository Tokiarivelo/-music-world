"""Deterministic mock director: derives a template from the analysis summary (no key, always available)."""

import colorsys
from typing import Any

from music_world.director.application.ports import PromptRequest, ProviderReply
from music_world.director.application.summary import AnalysisSummary
from music_world.director.domain.providers import ProviderId

MOCK_MODEL = "mock-director-1"


def _hex(h: float, s: float, v: float) -> str:
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, max(0.0, min(s, 1.0)), max(0.0, min(v, 1.0)))
    return f"#{round(r * 255):02x}{round(g * 255):02x}{round(b * 255):02x}"


def _palette(summary: AnalysisSummary) -> dict[str, str]:
    energy = summary.mean_energy
    # Minor → cooler (blue-violet / cyan), major → warmer (magenta / amber). Energy brightens the accents.
    base = 0.70 if summary.is_minor else 0.88
    value = 0.85 + 0.15 * min(energy * 2, 1.0)
    return {
        "background": _hex(base, 0.75, 0.10),
        "terrain": _hex(base, 0.55, 0.20),
        "primary": _hex(base + 0.05, 0.70, value),
        "accent": _hex(base + (0.12 if summary.is_minor else 0.20), 0.70, value),
        "secondary": _hex(0.52 if summary.is_minor else 0.11, 0.80, 0.93),
        "staff": "#e8f7ff",
    }


def _terciles(summary: AnalysisSummary) -> tuple[int, int]:
    lo, hi = summary.pitch_min, summary.pitch_max
    span = max(hi - lo, 3)
    low = min(max(lo + span // 3, 1), 125)
    high = min(max(lo + 2 * span // 3, low + 1), 126)
    return low, high


def mock_template(summary: AnalysisSummary) -> dict[str, Any]:
    energy = summary.mean_energy
    low, high = _terciles(summary)
    mappings: list[dict[str, Any]] = []
    if "vocals" in summary.stems:
        mappings.append({"when": {"stem": "vocals"}, "spawn": "crystal", "heightFrom": "duration"})
    mappings += [
        {"when": {"pitch": f"<{low}"}, "spawn": "terrain_ridge", "heightFrom": "velocity"},
        {"when": {"pitch": f"{low}-{high}"}, "spawn": "building", "heightFrom": "velocity"},
        {"when": {"pitch": f">{high}"}, "spawn": "spike", "heightFrom": "velocity"},
        {"when": {}, "spawn": "building"},
    ]
    tempo = summary.tempo_bpm or 100.0
    mood = "Cool" if summary.is_minor else "Warm"
    return {
        "name": f"{mood} Nocturne · {summary.key} · {tempo:.0f} BPM"[:60],
        "palette": _palette(summary),
        "terrain": {"style": "cracked_plate", "mountains": "edges", "size": 12 + round(min(energy, 1.0) * 4)},
        "staff": {
            "style": "glowing_lines",
            "path": "diagonal_curve",
            "clef": "treble",
            "glow": round(1.0 + energy, 2),
            "lookahead": 3.0 if tempo >= 140 else 5.0 if tempo < 80 else 4.0,
            "fallDuration": 0.35,
        },
        "mappings": mappings,
        "zones": [
            {"kind": "building", "xMin": -0.95, "xMax": -0.1, "zMin": -0.95, "zMax": 0.3},
            {"kind": "spike", "xMin": -0.95, "xMax": -0.6, "zMin": -0.95, "zMax": 0.45},
            {"kind": "terrain_ridge", "xMin": 0.6, "xMax": 0.95, "zMin": -0.6, "zMax": 0.95},
        ],
        "budget": {"instancesPerKind": 2000 if summary.note_density > 4 else 1200},
        "fx": {
            "particles": "dust" if energy < 0.25 else "arcs",
            "bloom": round(0.6 + 0.8 * min(energy, 1.0), 2),
            "beatPulse": summary.tempo_bpm > 0,
            "chordLinks": "light_arc",
        },
    }


class MockProvider:
    @property
    def name(self) -> ProviderId:
        return "mock"

    @property
    def model(self) -> str:
        return MOCK_MODEL

    async def complete_json(self, request: PromptRequest) -> ProviderReply:
        return ProviderReply(mock_template(request.summary), 0.0)
