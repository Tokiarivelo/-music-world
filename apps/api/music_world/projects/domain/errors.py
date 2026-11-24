from music_world.shared.errors import MusicWorldError, NotFoundError


class JobNotFoundError(NotFoundError):
    code = "JOB_NOT_FOUND"


class InvalidJobTransitionError(MusicWorldError):
    code = "JOB_INVALID_TRANSITION"


class InvalidJobProgressError(MusicWorldError):
    code = "JOB_INVALID_PROGRESS"


class UnknownJobKindError(MusicWorldError):
    code = "JOB_KIND_UNKNOWN"


class ProjectNotFoundError(NotFoundError):
    code = "PROJECT_NOT_FOUND"


class EditsTooLargeError(MusicWorldError):
    code = "EDITS_TOO_LARGE"


class AudioTooLargeError(MusicWorldError):
    code = "AUDIO_TOO_LARGE"


class AudioFormatUnsupportedError(MusicWorldError):
    code = "AUDIO_FORMAT_UNSUPPORTED"


class AudioTooLongError(MusicWorldError):
    code = "AUDIO_TOO_LONG"


class AudioUnreadableError(MusicWorldError):
    code = "AUDIO_UNREADABLE"


class LyricsFileInvalidError(MusicWorldError):
    code = "LRC_INVALID"
