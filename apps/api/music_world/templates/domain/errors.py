"""Template store errors (stable codes, mapped to HTTP in `shared/http.py`)."""

from music_world.shared.errors import MusicWorldError, NotFoundError


class TemplateInvalidError(MusicWorldError):
    code = "TEMPLATE_INVALID"


class StoreTemplateNotFoundError(NotFoundError):
    code = "TEMPLATE_NOT_FOUND"


class ThumbnailTooLargeError(MusicWorldError):
    code = "THUMBNAIL_TOO_LARGE"


class ThumbnailTypeUnsupportedError(MusicWorldError):
    code = "THUMBNAIL_TYPE_UNSUPPORTED"


class ThumbnailInvalidError(MusicWorldError):
    code = "THUMBNAIL_INVALID"


class TemplateNotReportableError(MusicWorldError):
    """Launch templates and the caller's own templates cannot be reported."""

    code = "TEMPLATE_NOT_REPORTABLE"


class TemplateNotEditableError(MusicWorldError):
    """Only a draft can be edited: a published (or hidden) template is immutable."""

    code = "TEMPLATE_NOT_EDITABLE"
