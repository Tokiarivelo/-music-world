import copy
import json
import struct
from pathlib import Path
from typing import Any

NEON = json.loads((Path(__file__).parents[3] / "music_world/director/infrastructure/default_template.json").read_text())


def template(**changes: Any) -> dict[str, Any]:
    doc = copy.deepcopy(NEON)
    doc.update(changes)
    return doc


def png(width: int = 256, height: int = 256, pad: int = 64) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", width, height) + b"\x00" * pad


def jpeg(width: int = 256, height: int = 200) -> bytes:
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00" + b"\x00" * 9
    sof = b"\xff\xc0" + struct.pack(">HBHH", 17, 8, height, width) + b"\x03" + b"\x00" * 9
    return b"\xff\xd8" + app0 + sof + b"\xff\xd9"


def webp_vp8x(width: int = 256, height: int = 256) -> bytes:
    body = b"WEBP" + b"VP8X" + struct.pack("<I", 10) + b"\x00\x00\x00\x00"
    body += (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little")
    return b"RIFF" + struct.pack("<I", len(body)) + body


def webp_vp8l(width: int = 100, height: int = 50) -> bytes:
    bits = (width - 1) | ((height - 1) << 14)
    body = b"WEBP" + b"VP8L" + struct.pack("<I", 5) + b"\x2f" + struct.pack("<I", bits)
    return b"RIFF" + struct.pack("<I", len(body)) + body


def webp_vp8(width: int = 128, height: int = 96) -> bytes:
    frame = b"\x00\x00\x00" + b"\x9d\x01\x2a" + struct.pack("<HH", width, height)
    body = b"WEBP" + b"VP8 " + struct.pack("<I", len(frame)) + frame
    return b"RIFF" + struct.pack("<I", len(body)) + body
