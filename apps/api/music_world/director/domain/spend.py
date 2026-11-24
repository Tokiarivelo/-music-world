"""Cost estimate of one provider call (tokens × catalogue price, USD per 1M tokens)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Price:
    input_per_mtok: float
    output_per_mtok: float


def call_cost_usd(price: Price, input_tokens: int, output_tokens: int) -> float:
    return (max(input_tokens, 0) * price.input_per_mtok + max(output_tokens, 0) * price.output_per_mtok) / 1_000_000


def over_cap(spent_usd: float, cap_usd: float) -> bool:
    return spent_usd >= cap_usd
