from typing import Literal, Protocol

CheckStatus = Literal["ok", "error", "not_configured"]


class DependencyProbe(Protocol):
    async def check(self) -> CheckStatus: ...
