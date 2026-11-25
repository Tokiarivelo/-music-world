"""The ocean launch template "Nemo Reef" (featured next to the Halloween one)."""

from httpx import ASGITransport, AsyncClient

from music_world.main import create_app
from music_world.schemas.template import WorldTemplate
from music_world.shared.settings import Settings
from music_world.templates.domain.specification import BUILTIN_KINDS, relative_luminance, store_errors
from music_world.templates.infrastructure.featured_catalog import KIROWEEN_STORE_ID, NEMO_STORE_ID, FileFeaturedCatalog
from tests.fakes import StaticProbe
from tests.integration.test_http import LifespanManager, make_container

OBJECT_KINDS = {"cloud", "tree", "conifer", "bush", "car", "bicycle", "airplane"}  # I8, not part of the reef


def test_nemo_has_every_ocean_object_standing_before_the_first_note() -> None:
    [nemo] = [t for t in FileFeaturedCatalog().all() if t.id == NEMO_STORE_ID]
    template = WorldTemplate.model_validate(nemo.document)
    assert len(template.recipes) == 16 and all(r.triangle_count() <= r.budget.max_triangles for r in template.recipes)
    standing = {item.kind for item in template.scenery}
    assert standing == (BUILTIN_KINDS - OBJECT_KINDS) | {
        f"recipe:{r.name}" for r in template.recipes
    }  # all 21 kinds are on the plate
    assert {rule.spawn for rule in template.mappings} <= standing  # notes spawn more of the same kinds
    assert sum(item.count for item in template.scenery) <= 400


def test_nemo_template_is_featured_valid_and_ocean_coloured() -> None:
    [nemo] = [t for t in FileFeaturedCatalog().all() if t.id == NEMO_STORE_ID]
    template = WorldTemplate.model_validate(nemo.document)
    assert nemo.featured and nemo.author_name == "Music World" and template.id == "nemo-reef"
    assert store_errors(nemo.document) == [] and template.license == "CC-BY-4.0"
    recipe_kinds = {f"recipe:{r.name}" for r in template.recipes}
    assert {rule.spawn for rule in template.mappings} <= BUILTIN_KINDS | recipe_kinds
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
