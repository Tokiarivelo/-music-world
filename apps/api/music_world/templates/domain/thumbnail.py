"""Thumbnail checks (requirement 3.6): type detected from the bytes (never the file name or client MIME type),
size and pixel dimensions read from the header. Images are stored as received, never decoded or executed."""

from dataclasses import dataclass

from music_world.templates.domain.errors import (
    ThumbnailInvalidError,
    ThumbnailTooLargeError,
    ThumbnailTypeUnsupportedError,
)

MAX_THUMBNAIL_BYTES = 128 * 1024
MAX_THUMBNAIL_SIDE = 640


@dataclass(frozen=True)
class ThumbnailInfo:
    content_type: str
    extension: str
    width: int
    height: int


def _png_size(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise ThumbnailInvalidError("PNG header is incomplete")
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


_JPEG_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def _jpeg_size(data: bytes) -> tuple[int, int]:
    i = 2
    while i + 9 <= len(data):
        if data[i] != 0xFF:
            raise ThumbnailInvalidError("JPEG segment marker expected")
        marker = data[i + 1]
        if marker == 0xFF:  # fill byte
            i += 1
            continue
        if marker in _JPEG_SOF:
            return int.from_bytes(data[i + 7 : i + 9], "big"), int.from_bytes(data[i + 5 : i + 7], "big")
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        if length < 2:
            raise ThumbnailInvalidError("JPEG segment length is invalid")
        i += 2 + length
    raise ThumbnailInvalidError("JPEG has no frame header")


def _webp_size(data: bytes) -> tuple[int, int]:
    chunk = data[12:16]
    if chunk == b"VP8 " and len(data) >= 30 and data[23:26] == b"\x9d\x01\x2a":
        return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
    if chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
        bits = int.from_bytes(data[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8X" and len(data) >= 30:
        return int.from_bytes(data[24:27], "little") + 1, int.from_bytes(data[27:30], "little") + 1
    raise ThumbnailInvalidError("WebP header is incomplete")


def check_thumbnail(data: bytes) -> ThumbnailInfo:
    if len(data) > MAX_THUMBNAIL_BYTES:
        raise ThumbnailTooLargeError(f"thumbnail is larger than {MAX_THUMBNAIL_BYTES // 1024} KB")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        content_type, extension, (width, height) = "image/png", "png", _png_size(data)
    elif data.startswith(b"\xff\xd8\xff"):
        content_type, extension, (width, height) = "image/jpeg", "jpg", _jpeg_size(data)
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        content_type, extension, (width, height) = "image/webp", "webp", _webp_size(data)
    else:
        raise ThumbnailTypeUnsupportedError("thumbnails must be PNG, JPEG or WebP images")
    if not (0 < width <= MAX_THUMBNAIL_SIDE and 0 < height <= MAX_THUMBNAIL_SIDE):
        raise ThumbnailInvalidError(f"thumbnail must be at most {MAX_THUMBNAIL_SIDE} × {MAX_THUMBNAIL_SIDE} pixels")
    return ThumbnailInfo(content_type, extension, width, height)
