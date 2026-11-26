"""Layout prompt: analysis summary + the inventory of the chosen template → one `WorldLayout` JSON object."""

import json
from typing import Any

from music_world.director.application.summary import AnalysisSummary

LAYOUT_PROMPT_VERSION = "layout-v1"

_ROLE = """You are the set designer of Music World. The user chose a world template; its inventory lists every object
it can put in the world. Write the layout: where each object grows and in which order the notes pick them.

Rules:
- Answer with exactly one JSON object: {"patches": [...], "sequence": [...]}. No prose, no Markdown.
- patches: regions of the plate in normalized coordinates -1..1, each {"id": "keep_1" (lowercase, digits, underscore),
  "theme": kelp | coral | sand | wreck | keep | village | forest | crystal, "x", "z", "radius" 0.05-0.6}.
  Put the heart of the world (keep, village) near the centre and the outskirts (forest, crystal, kelp, sand) outwards.
  Patches must not overlap. At most 24 patches.
- sequence: ordered steps {"kind": <a kind of the inventory>, "patch": <a patch id>, "weight": 0-10}. Notes walk
  through the sequence in order, each step in proportion to its weight; weight 0 keeps a rare landmark out of the
  rotation. Use only kinds of the inventory; every grounded object (role "benthic") should appear. At most 48 steps.
- Let the song decide the mood: calm music gets few, wide, soft patches; dense or loud music gets crowded ones."""


class LayoutPromptSet:
    version = LAYOUT_PROMPT_VERSION

    def system(self, schema: dict[str, Any]) -> str:
        return f"{_ROLE}\n\nJSON Schema (WorldLayout):\n{json.dumps(schema, separators=(',', ':'))}"

    def user(self, summary: AnalysisSummary, inventory: list[dict[str, str]]) -> str:
        listed = "\n".join(f"- {i['kind']} ({i['role']})" for i in inventory)
        return (
            f"Music summary:\n{summary.text()}\n\nInventory of the template:\n{listed}\n\n"
            "Return one layout JSON object."
        )
