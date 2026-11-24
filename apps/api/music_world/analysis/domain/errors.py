from music_world.shared.errors import MusicWorldError, NotFoundError


class AudioDecodeError(MusicWorldError):
    code = "AUDIO_DECODE_FAILED"


class SeparationError(MusicWorldError):
    code = "SEPARATION_FAILED"


class TranscriptionError(MusicWorldError):
    code = "TRANSCRIPTION_FAILED"


class AnalysisInvalidError(MusicWorldError):
    code = "ANALYSIS_INVALID"


class AudioMissingError(MusicWorldError):
    code = "AUDIO_MISSING"


class AnalysisNotReadyError(MusicWorldError):
    code = "ANALYSIS_NOT_READY"


class AnalysisNotFoundError(NotFoundError):
    code = "ANALYSIS_NOT_FOUND"
