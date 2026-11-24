"""Catalogue prices (USD per 1M tokens) for the spend estimate. Verified 2026-11-24 (see the spec design.md)."""

from music_world.director.domain.spend import Price

PRICES: dict[str, Price] = {
    "muse-spark-1.3": Price(1.25, 4.25),
    "muse-wonder-1.0": Price(4.00, 20.00),
    # Anthropic list prices; Claude in Amazon Bedrock bills through AWS (estimate for the cap only).
    "anthropic.claude-sonnet-5-5": Price(2.00, 10.00),
    "anthropic.claude-opus-5-5": Price(4.00, 20.00),
}
# Unknown model ids are charged at the highest known price, so the cap stays conservative.
FALLBACK_PRICE = Price(max(p.input_per_mtok for p in PRICES.values()), max(p.output_per_mtok for p in PRICES.values()))


def price_of(model: str) -> Price:
    return PRICES.get(model, FALLBACK_PRICE)
