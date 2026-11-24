"""The Halloween launch template (06-template-store requirement 5.1)."""

from httpx import ASGITransport, AsyncClient

from music_world.main import create_app
from music_world.schemas.template import WorldTemplate
from music_world.shared.settings import Settings
from music_world.templates.domain.specification import BUILTIN_KINDS, relative_luminance, store_errors
from music_world.templates.infrastructure.featured_catalog import KIROWEEN_STORE_ID, FileFeaturedCatalog
from tests.fakes import StaticProbe
from tests.integration.test_http import LifespanManager, make_container


def test_kiroween_template_is_featured_valid_and_halloween_coloured() -> None:
    [kiroween] = [t for t in FileFeaturedCatalog().all() if t.id == KIROWEEN_STORE_ID]
    doc = kiroween.document
    template = WorldTemplate.model_validate(doc)
    assert kiroween.featured and kiroween.author_name == "Music World" and template.id == "kiroween-pumpkin-night"
    assert store_errors(doc) == [] and template.license == "CC-BY-4.0"
    assert {rule.spawn for rule in template.mappings} <= BUILTIN_KINDS and template.mappings[-1].when.model_dump(
        exclude_none=True
    ) == {}
    assert template.palette.accent == "#ff7a1a"  # pumpkin orange
    assert relative_luminance(template.palette.background) < 0.01  # night sky


async def test_kiroween_template_heads_the_public_gallery() -> None:
    app = create_app(Settings(app_env="test"), lambda s: make_container(s, StaticProbe("ok")))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as c, LifespanManager(c):
        gallery = (await c.get("/api/templates")).json()
        one = await c.get(f"/api/templates/{KIROWEEN_STORE_ID}")
    assert gallery["items"][0]["id"] == KIROWEEN_STORE_ID and gallery["items"][0]["featured"] is True
    assert one.status_code == 200 and one.json()["template"]["name"] == "Kiroween Pumpkin Night"
