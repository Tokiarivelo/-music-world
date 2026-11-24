"""Template document validation: `music-world.template.v1` (pydantic) then the store specification."""

from typing import Any

from pydantic import ValidationError

from music_world.schemas.template import WorldTemplate
from music_world.templates.domain.errors import TemplateInvalidError
from music_world.templates.domain.specification import MAX_TEMPLATE_BYTES, store_errors

MAX_ERRORS = 20


def validated_document(raw: Any, *, raw_size: int = 0) -> dict[str, Any]:
    """The normalized JSON document (camelCase, defaults filled), or `TemplateInvalidError` with `[{loc, msg}]`."""
    if raw_size > MAX_TEMPLATE_BYTES * 2:  # cheap guard before validating a huge document
        raise TemplateInvalidError("template is invalid", details=[{"loc": ["template"], "msg": "too large"}])
    try:
        model = WorldTemplate.model_validate(raw)
    except ValidationError as error:
        details: list[dict[str, object]] = [
            {"loc": ["template", *e["loc"]], "msg": e["msg"]} for e in error.errors()[:MAX_ERRORS]
        ]
        raise TemplateInvalidError("template is invalid", details=details) from error
    doc = model.model_dump(mode="json", by_alias=True, exclude_none=True)
    errors = store_errors(doc)
    if errors:
        raise TemplateInvalidError("template is invalid", details=errors)
    return doc
