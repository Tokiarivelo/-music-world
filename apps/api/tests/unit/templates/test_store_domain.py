import contextlib
from datetime import UTC, datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st

from music_world.schemas.template import WorldTemplate
from music_world.templates.application.validation import validated_document
from music_world.templates.domain.errors import (
    TemplateInvalidError,
    ThumbnailInvalidError,
    ThumbnailTooLargeError,
    ThumbnailTypeUnsupportedError,
)
from music_world.templates.domain.model import PageCursor, store_template_id
from music_world.templates.domain.specification import store_errors
from music_world.templates.domain.thumbnail import check_thumbnail
from tests.unit.templates.helpers import NEON, jpeg, png, template, webp_vp8, webp_vp8l, webp_vp8x

ROW = "0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"


@given(st.from_regex(r"[a-z0-9]+(-[a-z0-9]+){0,12}", fullmatch=True).filter(lambda s: len(s) <= 60))
def test_store_template_id_is_a_valid_unique_template_id(submitted: str) -> None:
    template_id = store_template_id(submitted, ROW)
    assert template_id.endswith("-2e3f4a5b")
    assert len(template_id) <= 60
    WorldTemplate.model_validate({**NEON, "id": template_id})  # still matches the kebab-case pattern


def test_store_template_id_suffix() -> None:
    assert store_template_id("neon-nocturne", ROW) == "neon-nocturne-2e3f4a5b"


def test_cursor_round_trip_and_garbage() -> None:
    cursor = PageCursor(datetime(2026, 11, 26, 10, 0, tzinfo=UTC), ROW)
    assert PageCursor.decode(cursor.encode()) == cursor
    for garbage in ("", "!!!", "x" * 300, "bm8tcGlwZQ", "MjAyNi0xMS0yNnxh"):  # no pipe / naive datetime
        assert PageCursor.decode(garbage) is None


def test_the_default_template_passes_the_store_specification() -> None:
    assert store_errors(validated_document(NEON)) == []


@pytest.mark.parametrize(
    ("changes", "loc"),
    [
        ({"name": "Visit https://evil.example"}, ["template", "name"]),
        ({"name": "<script>x</script>"}, ["template", "name"]),
        ({"name": "www.evil.example"}, ["template", "name"]),
        ({"palette": {**NEON["palette"], "staff": "#07051b"}}, ["template", "palette", "staff"]),
        ({"mappings": [{"when": {}, "spawn": "recipe:ghost"}]}, ["template", "mappings", 0, "spawn"]),
    ],
)
def test_store_specification_rejects(changes: dict[str, object], loc: list[object]) -> None:
    with pytest.raises(TemplateInvalidError) as error:
        validated_document(template(**changes))
    assert loc in [d["loc"] for d in error.value.details]


def test_schema_errors_carry_their_location() -> None:
    with pytest.raises(TemplateInvalidError) as error:
        validated_document(template(license="GPL-3.0", extra="x"))
    locs = [d["loc"] for d in error.value.details]
    assert ["template", "license"] in locs and ["template", "extra"] in locs
    with pytest.raises(TemplateInvalidError):
        validated_document("not an object")


@pytest.mark.parametrize(
    ("data", "content_type", "size"),
    [
        (png(), "image/png", (256, 256)),
        (jpeg(), "image/jpeg", (256, 200)),
        (webp_vp8x(), "image/webp", (256, 256)),
        (webp_vp8l(), "image/webp", (100, 50)),
        (webp_vp8(), "image/webp", (128, 96)),
    ],
)
def test_thumbnail_types_are_detected_by_content(data: bytes, content_type: str, size: tuple[int, int]) -> None:
    info = check_thumbnail(data)
    assert (info.content_type, (info.width, info.height)) == (content_type, size)


def test_thumbnail_rejections() -> None:
    with pytest.raises(ThumbnailTooLargeError):
        check_thumbnail(png(pad=129 * 1024))
    for data in (b"GIF89a" + b"\x00" * 40, b"<svg xmlns='http://www.w3.org/2000/svg'/>", b""):
        with pytest.raises(ThumbnailTypeUnsupportedError):
            check_thumbnail(data)
    for data in (
        png(641, 10),
        png(0, 10),
        png()[:20],
        jpeg()[:12],
        webp_vp8x(2000, 10),
        b"RIFF\x00\x00\x00\x00WEBPVP8 ",
    ):
        with pytest.raises(ThumbnailInvalidError):
            check_thumbnail(data)


@given(st.binary(max_size=200))
def test_thumbnail_check_never_crashes_on_arbitrary_bytes(data: bytes) -> None:
    with contextlib.suppress(ThumbnailInvalidError, ThumbnailTypeUnsupportedError):
        check_thumbnail(data)


def test_store_accepts_defined_shape_recipes_only() -> None:
    recipe = {"name": "tower", "parts": [{"op": "box"}]}
    doc = validated_document(template(mappings=[{"when": {}, "spawn": "recipe:tower"}], recipes=[recipe]))
    assert doc["recipes"][0]["name"] == "tower"
    with pytest.raises(TemplateInvalidError) as error:
        validated_document(template(mappings=[{"when": {}, "spawn": "recipe:ghost"}], recipes=[recipe]))
    assert ["template", "mappings", 0, "spawn"] in [d["loc"] for d in error.value.details]
