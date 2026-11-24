from hypothesis import given
from hypothesis import strategies as st

from music_world.director.domain.providers import default_provider, fallback_chain
from music_world.director.domain.renderable import relative_luminance, renderability_errors
from music_world.director.domain.spend import Price, call_cost_usd, over_cap


def test_chain_is_selected_then_other_real_then_mock() -> None:
    assert fallback_chain("muse", {"muse", "bedrock", "mock"}) == ["muse", "bedrock", "mock"]
    assert fallback_chain("bedrock", {"muse", "bedrock", "mock"}) == ["bedrock", "muse", "mock"]
    assert fallback_chain("muse", {"bedrock", "mock"}) == ["bedrock", "mock"]
    assert fallback_chain("mock", {"muse", "bedrock", "mock"}) == ["mock"]
    assert fallback_chain("muse", {"mock"}) == ["mock"]


@given(st.sampled_from(["muse", "bedrock", "mock"]), st.sets(st.sampled_from(["muse", "bedrock"])))
def test_chain_always_ends_with_mock_and_never_repeats(selected: str, configured: set[str]) -> None:
    chain = fallback_chain(selected, configured)  # type: ignore[arg-type]
    assert chain[-1] == "mock" and len(chain) == len(set(chain))
    assert all(p in configured or p == "mock" for p in chain)


def test_selecting_mock_never_calls_a_paid_provider() -> None:
    assert fallback_chain("mock", {"muse", "bedrock"}) == ["mock"]


def test_default_provider_falls_back_when_unconfigured() -> None:
    assert default_provider("muse", {"mock"}) == "mock"
    assert default_provider("muse", {"bedrock", "mock"}) == "bedrock"
    assert default_provider("bedrock", {"muse", "bedrock", "mock"}) == "bedrock"


def test_cost_and_cap() -> None:
    assert call_cost_usd(Price(1.25, 4.25), 1_000_000, 1_000_000) == 5.5
    assert call_cost_usd(Price(1, 1), -5, 0) == 0
    assert over_cap(1.0, 1.0) and not over_cap(0.99, 1.0)


@given(st.from_regex(r"#[0-9a-f]{6}", fullmatch=True))
def test_luminance_is_between_0_and_1(color: str) -> None:
    assert 0 <= relative_luminance(color) <= 1


def test_renderability_rejects_recipes_unreadable_staff_and_huge_templates() -> None:
    palette = {"background": "#000000", "staff": "#ffffff"}
    assert renderability_errors({"palette": palette, "mappings": [{"spawn": "building"}]}) == []
    assert renderability_errors({"mappings": [{"spawn": "recipe:tower"}]})
    assert renderability_errors({"zones": [{"kind": "recipe:tower"}]})
    assert renderability_errors({"palette": {"background": "#101010", "staff": "#151515"}})
    assert renderability_errors({"mappings": [{"spawn": "building", "x": "a" * 40_000}]})
