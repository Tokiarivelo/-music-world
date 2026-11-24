"""World direction prompt: analysis summary → one `music-world.template.v1` JSON object."""

import json
from typing import Any

from music_world.director.application.summary import AnalysisSummary

PROMPT_VERSION = "director-v2"

# Closed enums repeated in plain words (requirement 2.2); the JSON Schema below is the authority.
_ENUMS = """Allowed values (closed lists, use nothing else):
- terrain.style: cracked_plate | smooth_plate; terrain.mountains: edges | none; terrain.size: 4-40
- staff.path: diagonal_curve | straight; staff.clef: treble | none; staff.glow 0-3; staff.lookahead 1-8;
  staff.fallDuration 0.1-2
- mappings[].spawn and zones[].kind: terrain_ridge | building | spike | crystal, or "recipe:<name>" for a shape you
  define in "recipes"
- recipes (optional, at most 4): {"name": "a_b_1" (lowercase, digits, underscore), "parts": 1-8 items, "budget":
  {"maxTriangles": 12-2000}}; every "recipe:<name>" used must have a recipe of that name
- recipe part "op": box | prism | spike | stack | cluster; numbers (footprint is the unit square): width, depth,
  height 0.05-1, y 0-1 (base height), sides 3-12 and taper 0-1 (prism), levels 2-8 and shrink 0.5-1 (stack),
  count 2-12 and spread 0-1 (cluster), of: box | prism | spike (what a stack or cluster repeats), seedOffset 0-99
- triangles: box 12, prism 4*sides (2*sides when taper is 0), spike 4; stack = levels * of; cluster = count * of;
  the sum over parts must not exceed maxTriangles; keep recipes small (under 300 triangles)
- mappings[].when: pitch "<a" | ">a" | "a-b" (MIDI 0-127), velocity same syntax with 0-1, chord true | false,
  stem vocals | drums | bass | other; an empty "when" matches every note; the first matching rule wins
- mappings[].heightFrom: velocity | duration | pitch; mappings[].colorRole: primary | accent | secondary | staff
- zones: rectangles in normalized plate coordinates -1..1 with xMin < xMax and zMin < zMax
- fx.particles: arcs | dust | none; fx.bloom 0-2; fx.beatPulse true | false; fx.chordLinks: light_arc | none
- palette: six "#rrggbb" colors; the staff color must stand out clearly from the background"""

_ROLE = """You are the art director of Music World, which turns a song into a glowing 3D diorama: a terrain plate,
a musical staff crossing it, and shapes that grow from the notes. From the music summary, design one world template
whose palette, shapes, layout and effects express the song's mood, harmony, energy and lyrics.

Rules:
- Answer with exactly one JSON object conforming to the JSON Schema below. No prose, no Markdown, no comments.
- Data only: no code, no URLs, no HTML. Unknown fields are removed.
- Give the world a short evocative "name" (at most 40 characters).
- Map low notes to terrain, the middle register to buildings and high notes to spikes or crystals, unless the
  music suggests another idea; end the mappings with a catch-all rule ("when": {}).
- Keep the world readable: a dark background, a bright staff, 3 to 8 mapping rules, at most 8 zones."""


class DirectorPromptSet:
    version = PROMPT_VERSION

    def system(self, schema: dict[str, Any]) -> str:
        compact = json.dumps(schema, separators=(",", ":"))
        return f"{_ROLE}\n\n{_ENUMS}\n\nJSON Schema (music-world.template.v1):\n{compact}"

    def user(self, summary: AnalysisSummary) -> str:
        return f"Music summary:\n{summary.text()}\n\nReturn one WorldTemplate JSON object."

    def repair(self, summary: AnalysisSummary, errors: list[str]) -> str:
        listed = "\n".join(f"- {e}" for e in errors)
        return (
            f"{self.user(summary)}\n\nYour previous answer was rejected by the validator:\n{listed}\n"
            "Return a corrected WorldTemplate JSON object only."
        )
