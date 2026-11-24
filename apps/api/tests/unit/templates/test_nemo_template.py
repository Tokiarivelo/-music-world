"""The ocean launch template "Nemo Reef" (featured next to the Halloween one)."""

from httpx import ASGITransport, AsyncClient

from music_world.main import create_app
from music_world.schemas.template import WorldTemplate
from music_world.shared.settings import Settings
from music_world.templates.domain.specification import BUILTIN_KINDS, relative_luminance, store_errors
from music_world.templates.infrastructure.featured_catalog import KIROWEEN_STORE_ID, NEMO_STORE_ID, FileFeaturedCatalog
from tests.fakes import StaticProbe
from tests.integration.test_http import LifespanManager, make_container


def test_nemo_template_is_featured_valid_and_ocean_coloured() -> None:
    [nemo] = [t for t in FileFeaturedCatalog().all() if t.id == NEMO_STORE_ID]
    template = WorldTemplate.model_validate(nemo.document)
    assert nemo.featured and nemo.author_name == "Music World" and template.id == "nemo-reef"
    assert store_errors(nemo.document) == [] and template.license == "CC-BY-4.0"
    assert {rule.spawn for rule in template.mappings} <= BUILTIN_KINDS
    assert template.mappings[-1].when.model_dump(exclude_none=True) == {}
    assert template.palette.accent == "#ff8a1f"  # clownfish orange
    assert relative_luminance(template.palette.background) < 0.01  # deep water


async def test_both_launch_templates_head_the_gallery_in_order() -> None:
    app = create_app(Settings(app_env="test"), lambda s: make_container(s, StaticProbe("ok")))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as c, LifespanManager(c):
        gallery = (await c.get("/api/templates")).json()
        one = await c.get(f"/api/templates/{NEMO_STORE_ID}")
    assert [i["id"] for i in gallery["items"][:2]] == [KIROWEEN_STORE_ID, NEMO_STORE_ID]
    assert one.status_code == 200 and one.json()["template"]["name"] == "Nemo Reef"
