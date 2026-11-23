from music_world.shared.errors import MusicWorldError, NotFoundError


class JobNotFoundError(NotFoundError):
    code = "JOB_NOT_FOUND"


class InvalidJobTransitionError(MusicWorldError):
    code = "JOB_INVALID_TRANSITION"


class InvalidJobProgressError(MusicWorldError):
    code = "JOB_INVALID_PROGRESS"


class UnknownJobKindError(MusicWorldError):
    code = "JOB_KIND_UNKNOWN"
