"""Composition root: the only place where ports are bound to adapters."""

import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import structlog
from arq.connections import ArqRedis
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncEngine

from music_world.accounts.application.ports import (
    EmailSender,
    LoginTokenRepository,
    ModeratorDirectory,
    SessionRepository,
    UserRepository,
)
from music_world.accounts.application.use_cases.sign_in import (
    RequestMagicLink,
    ResolveSession,
    SignOut,
    VerifyMagicLink,
)
from music_world.accounts.infrastructure.email_senders import ConsoleEmailSender, SmtpEmailSender
from music_world.accounts.infrastructure.moderators import EmailHashModeratorDirectory
from music_world.accounts.infrastructure.sqlalchemy_repositories import (
    SqlAlchemyLoginTokenRepository,
    SqlAlchemySessionRepository,
    SqlAlchemyUserRepository,
)
from music_world.analysis.application.use_cases.analysis_cache import AnalysisCache
from music_world.analysis.application.use_cases.get_project_analysis import GetProjectAnalysis
from music_world.analysis.infrastructure.project_audio_source import ProjectsAudioSource
from music_world.analysis.infrastructure.sqlalchemy_analysis_repository import SqlAlchemyAnalysisRepository
from music_world.director.application.ports import LLMProvider, ProjectAnalyses
from music_world.director.application.use_cases.generate_world import (
    GenerateDemoWorld,
    GenerateProjectWorld,
    GenerateWorld,
)
from music_world.director.application.use_cases.list_providers import ListProviders
from music_world.director.domain.providers import ProviderId, default_provider
from music_world.director.infrastructure.default_template import default_template
from music_world.director.infrastructure.object_store_cache import ObjectStoreDirectorCache, ObjectStoreSpendTracker
from music_world.director.infrastructure.prompts import DirectorPromptSet
from music_world.director.infrastructure.providers.mock import MOCK_MODEL, MockProvider
from music_world.director.infrastructure.providers.muse import MuseProvider
from music_world.projects.application.ports import JobHandler
from music_world.projects.application.use_cases.check_project_access import CheckProjectAccess
from music_world.projects.application.use_cases.create_project import CreateProject
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_job import GetJob
from music_world.projects.application.use_cases.get_project import GetProject
from music_world.projects.application.use_cases.get_project_audio import GetProjectAudio
from music_world.projects.application.use_cases.project_edits import GetProjectEdits, SaveProjectEdits
from music_world.projects.application.use_cases.run_job import RunJob
from music_world.projects.domain.job_kinds import ANALYZE_PROJECT_JOB_KIND, DEMO_JOB_KIND, SEARCH_LYRICS_JOB_KIND
from music_world.projects.infrastructure.arq_job_queue import ArqJobQueue
from music_world.projects.infrastructure.demo_job_handler import DemoJobHandler
from music_world.projects.infrastructure.ffprobe_audio_probe import FfprobeAudioProbe
from music_world.projects.infrastructure.sqlalchemy_job_repository import SqlAlchemyJobRepository
from music_world.projects.infrastructure.sqlalchemy_project_repository import SqlAlchemyProjectRepository
from music_world.shared.clock import utc_now
from music_world.shared.db import create_engine, create_session_factory
from music_world.shared.ids import uuid7
from music_world.shared.object_store import ObjectStoreAdapter, build_object_store
from music_world.shared.rate_limit import SlidingWindowLimiter
from music_world.shared.settings import Settings
from music_world.system.application.use_cases.check_health import CheckHealth
from music_world.system.infrastructure.probes import PostgresProbe, RedisProbe, S3Probe
from music_world.templates.application.ports import (
    FeaturedCatalog,
    ModerationAudit,
    ReportRepository,
    StoreTemplateRepository,
    ThumbnailStore,
)
from music_world.templates.application.use_cases.moderation import (
    ListHiddenTemplates,
    RemoveTemplate,
    RestoreTemplate,
)
from music_world.templates.application.use_cases.store import (
    CreateStoreTemplate,
    DeleteStoreTemplate,
    GetStoreTemplate,
    GetThumbnail,
    ListMyTemplates,
    ListPublishedTemplates,
    PublishStoreTemplate,
    ReportTemplate,
    SetThumbnail,
    UpdateDraftTemplate,
)
from music_world.templates.infrastructure.featured_catalog import FileFeaturedCatalog
from music_world.templates.infrastructure.sqlalchemy_store_repository import (
    SqlAlchemyModerationAudit,
    SqlAlchemyReportRepository,
    SqlAlchemyStoreTemplateRepository,
)

log = structlog.get_logger(__name__)


@dataclass
class DirectorServices:
    generate_world: GenerateWorld
    generate_project_world: GenerateProjectWorld
    generate_demo_world: GenerateDemoWorld
    list_providers: ListProviders
    limiter: SlidingWindowLimiter
    providers: dict[ProviderId, LLMProvider] = field(default_factory=dict)

    async def close(self) -> None:
        for provider in self.providers.values():
            closer = getattr(provider, "aclose", None)
            if closer is not None:
                await closer()


def _real_providers(settings: Settings) -> dict[ProviderId, LLMProvider]:
    """Real providers whose credentials are set (keys never leave the server)."""
    providers: dict[ProviderId, LLMProvider] = {}
    if settings.muse_configured and settings.meta_api_key is not None:
        key = settings.meta_api_key.get_secret_value()
        providers["muse"] = MuseProvider(key, settings.meta_director_model, settings.meta_base_url)
    if settings.bedrock_configured and settings.aws_region:
        from music_world.director.infrastructure.providers.bedrock import BedrockProvider  # SDK loaded only if used

        def secret(value: SecretStr | None) -> str | None:
            return value.get_secret_value() if value is not None else None

        providers["bedrock"] = BedrockProvider(
            settings.bedrock_model_id,
            settings.aws_region,
            access_key=secret(settings.aws_access_key_id),
            secret_key=secret(settings.aws_secret_access_key),
            session_token=secret(settings.aws_session_token),
            profile=settings.aws_profile,
            bearer_token=secret(settings.aws_bearer_token_bedrock),
        )
    return providers


def build_director(
    settings: Settings,
    store: ObjectStoreAdapter,
    analyses: ProjectAnalyses,
    providers: dict[ProviderId, LLMProvider] | None = None,
) -> DirectorServices:
    """Provider chain: selected → other configured real provider → mock (always present)."""
    real = _real_providers(settings) if providers is None else providers
    chain: dict[ProviderId, LLMProvider] = {**real, "mock": MockProvider()}
    default = default_provider(settings.llm_provider, chain)
    generate = GenerateWorld(
        chain,
        DirectorPromptSet(),
        ObjectStoreDirectorCache(store),
        ObjectStoreSpendTracker(store),
        default_template(),
        default_provider=default,
        spend_cap_usd=settings.meta_spend_cap_usd,
        timeout_sec=settings.director_timeout_sec,
    )
    models: dict[ProviderId, str] = {
        "muse": settings.meta_director_model,
        "bedrock": settings.bedrock_model_id,
        "mock": MOCK_MODEL,
    }
    return DirectorServices(
        generate_world=generate,
        generate_project_world=GenerateProjectWorld(analyses, generate),
        generate_demo_world=GenerateDemoWorld(generate),
        list_providers=ListProviders(models, set(chain), default),
        limiter=SlidingWindowLimiter(settings.director_rate_limit_per_hour, 3600.0),
        providers=chain,
    )


@dataclass
class AccountServices:
    request_magic_link: RequestMagicLink
    verify_magic_link: VerifyMagicLink
    resolve_session: ResolveSession
    sign_out: SignOut
    link_ip_limiter: SlidingWindowLimiter
    link_email_limiter: SlidingWindowLimiter
    verify_ip_limiter: SlidingWindowLimiter
    moderators: ModeratorDirectory


MAGIC_LINKS_PER_EMAIL_PER_HOUR = 5
MODERATION_ACTIONS_PER_HOUR = 120
VERIFY_PER_IP_PER_HOUR = 30


def new_secret_token() -> str:
    return secrets.token_urlsafe(32)  # 256 bits


def email_sender(settings: Settings) -> EmailSender:
    if settings.auth_email_sender == "smtp":
        if not (settings.smtp_host and settings.smtp_from):
            raise ValueError("AUTH_EMAIL_SENDER=smtp needs SMTP_HOST and SMTP_FROM")
        return SmtpEmailSender(
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_from,
            username=settings.smtp_username,
            password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            starttls=settings.smtp_starttls,
            ttl_min=settings.auth_token_ttl_min,
        )
    if settings.app_env == "production":
        log.warning("auth.console_email_sender_in_production")
    return ConsoleEmailSender()


def build_accounts(
    settings: Settings,
    users: UserRepository,
    tokens: LoginTokenRepository,
    sessions: SessionRepository,
    sender: EmailSender,
    *,
    new_token: Callable[[], str] = new_secret_token,
    new_id: Callable[[], str] = uuid7,
    clock: Callable[[], datetime] = utc_now,
    moderators: ModeratorDirectory | None = None,
) -> AccountServices:
    return AccountServices(
        request_magic_link=RequestMagicLink(
            tokens,
            sender,
            new_token,
            clock,
            base_url=settings.public_base_url,
            ttl=timedelta(minutes=settings.auth_token_ttl_min),
        ),
        verify_magic_link=VerifyMagicLink(
            tokens, users, sessions, new_token, new_id, clock, session_ttl=timedelta(days=settings.session_ttl_days)
        ),
        resolve_session=ResolveSession(sessions, users, clock),
        sign_out=SignOut(sessions),
        link_ip_limiter=SlidingWindowLimiter(settings.auth_rate_limit_per_hour, 3600.0),
        link_email_limiter=SlidingWindowLimiter(MAGIC_LINKS_PER_EMAIL_PER_HOUR, 3600.0),
        verify_ip_limiter=SlidingWindowLimiter(VERIFY_PER_IP_PER_HOUR, 3600.0),
        moderators=moderators or EmailHashModeratorDirectory(settings.moderator_emails),
    )


@dataclass
class TemplateServices:
    create: CreateStoreTemplate
    update: UpdateDraftTemplate
    publish: PublishStoreTemplate
    set_thumbnail: SetThumbnail
    delete: DeleteStoreTemplate
    get: GetStoreTemplate
    get_thumbnail: GetThumbnail
    list_published: ListPublishedTemplates
    list_mine: ListMyTemplates
    report: ReportTemplate
    list_hidden: ListHiddenTemplates
    restore: RestoreTemplate
    remove: RemoveTemplate
    moderation_limiter: SlidingWindowLimiter
    publish_limiter: SlidingWindowLimiter


def new_object_key() -> str:
    return secrets.token_hex(16)


def build_templates(
    settings: Settings,
    repo: StoreTemplateRepository,
    store: ThumbnailStore,
    reports: ReportRepository,
    audit: ModerationAudit,
    featured: FeaturedCatalog | None = None,
    *,
    new_id: Callable[[], str] = uuid7,
    clock: Callable[[], datetime] = utc_now,
) -> TemplateServices:
    catalog = featured if featured is not None else FileFeaturedCatalog()
    get = GetStoreTemplate(repo, catalog)
    return TemplateServices(
        create=CreateStoreTemplate(repo, new_id, clock),
        update=UpdateDraftTemplate(repo),
        publish=PublishStoreTemplate(repo, clock),
        set_thumbnail=SetThumbnail(repo, store, new_object_key),
        delete=DeleteStoreTemplate(repo),
        get=get,
        get_thumbnail=GetThumbnail(get, store),
        list_published=ListPublishedTemplates(repo, catalog),
        list_mine=ListMyTemplates(repo),
        report=ReportTemplate(repo, reports, get, clock, hide_threshold=settings.template_report_hide_threshold),
        list_hidden=ListHiddenTemplates(repo, reports),
        restore=RestoreTemplate(repo, reports, audit, new_id, clock),
        remove=RemoveTemplate(repo, reports, audit, new_id, clock),
        moderation_limiter=SlidingWindowLimiter(MODERATION_ACTIONS_PER_HOUR, 3600.0),
        publish_limiter=SlidingWindowLimiter(settings.template_publish_rate_limit_per_hour, 3600.0),
    )


@dataclass
class Container:
    settings: Settings
    enqueue_job: EnqueueJob
    get_job: GetJob
    run_job: RunJob
    check_health: CheckHealth
    create_project: CreateProject
    get_project: GetProject
    analysis_cache: AnalysisCache
    get_project_analysis: GetProjectAnalysis
    get_project_audio: GetProjectAudio
    director: DirectorServices
    accounts: AccountServices
    templates: TemplateServices
    check_project_access: CheckProjectAccess
    get_project_edits: GetProjectEdits
    save_project_edits: SaveProjectEdits
    upload_limiter: SlidingWindowLimiter = field(default_factory=lambda: SlidingWindowLimiter(20, 3600.0))
    engine: AsyncEngine | None = None
    redis: ArqRedis | None = None
    handlers: dict[str, JobHandler] = field(default_factory=dict)

    async def close(self) -> None:
        await self.director.close()
        if self.redis is not None:
            await self.redis.aclose()
        if self.engine is not None:
            await self.engine.dispose()


def _lyrics_search_handler(
    settings: Settings, store: ObjectStoreAdapter, repo: SqlAlchemyAnalysisRepository, projects: ProjectsAudioSource
) -> JobHandler:
    """The "search lyrics" job: an explicit request, so speech recognition is used even when `LYRICS_ASR` is off."""
    from music_world.analysis.application.lyrics_finder import LyricsFinder
    from music_world.analysis.application.use_cases.search_lyrics import SearchLyrics
    from music_world.analysis.infrastructure.audio_tags import FfprobeTagReader
    from music_world.analysis.infrastructure.lrclib_lookup import LrclibLookup
    from music_world.analysis.infrastructure.whisper_lyrics import WhisperLyricsTranscriber
    from music_world.analysis.interfaces.jobs import SearchLyricsJobHandler

    finder = LyricsFinder(
        store,
        LrclibLookup() if settings.lyrics_lookup else None,
        FfprobeTagReader(),
        WhisperLyricsTranscriber(settings.lyrics_asr_model, settings.lyrics_language),
    )
    return SearchLyricsJobHandler(SearchLyrics(projects, repo, store, finder))


def _analysis_handler(
    settings: Settings, store: ObjectStoreAdapter, repo: SqlAlchemyAnalysisRepository, projects: ProjectsAudioSource
) -> JobHandler:
    """The analysis pipeline with its real stages. Imported lazily: torch / librosa load only in the worker."""
    from music_world.analysis.application.use_cases.analyze_audio import AnalyzeAudio
    from music_world.analysis.infrastructure.audio_tags import FfprobeTagReader
    from music_world.analysis.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
    from music_world.analysis.infrastructure.demucs_separator import DemucsSeparator
    from music_world.analysis.infrastructure.ffmpeg_decoder import FfmpegDecoder
    from music_world.analysis.infrastructure.librosa_chroma import LibrosaChromaAnalyzer
    from music_world.analysis.infrastructure.librosa_rhythm import LibrosaRhythmAnalyzer
    from music_world.analysis.infrastructure.librosa_structure import LibrosaStructureAnalyzer
    from music_world.analysis.infrastructure.lrclib_lookup import LrclibLookup
    from music_world.analysis.infrastructure.null_lyrics import NoLyricsTranscriber
    from music_world.analysis.infrastructure.whisper_lyrics import WhisperLyricsTranscriber
    from music_world.analysis.interfaces.jobs import AnalyzeProjectJobHandler

    # LYRICS_PROVIDER=muse needs Muse Voice (02-music-analysis task 6.1, not implemented yet): no transcription for
    # now; a user `.lrc` still applies when the analysis is read.
    analyze = AnalyzeAudio(
        repo,
        store,
        FfmpegDecoder(),
        DemucsSeparator(settings.demucs_model),
        BasicPitchTranscriber(),
        LibrosaRhythmAnalyzer(),
        LibrosaStructureAnalyzer(),
        WhisperLyricsTranscriber(settings.lyrics_asr_model, settings.lyrics_language)
        if settings.lyrics_asr
        else NoLyricsTranscriber(),
        min_velocity=settings.analysis_min_velocity,
        chroma=LibrosaChromaAnalyzer(),
        lookup=LrclibLookup() if settings.lyrics_lookup else None,
        tags=FfprobeTagReader(),
    )
    return AnalyzeProjectJobHandler(projects, analyze)


def build_container(settings: Settings, *, with_analysis: bool = False) -> Container:
    """Builds adapters lazily: no connection is opened until first use, so the API starts even if a
    dependency is down (and /api/health reports it). `with_analysis` (worker only) registers the analysis job."""
    engine = create_engine(settings.database_url)
    sessions = create_session_factory(engine)
    redis = ArqRedis.from_url(settings.redis_url)
    repo = SqlAlchemyJobRepository(sessions)
    projects = SqlAlchemyProjectRepository(sessions)
    store = build_object_store(settings)
    analyses = SqlAlchemyAnalysisRepository(sessions)
    analysis_cache = AnalysisCache(analyses)
    handlers: dict[str, JobHandler] = {DEMO_JOB_KIND: DemoJobHandler()}
    enqueue_job = EnqueueJob(
        repo, ArqJobQueue(redis), [*handlers.keys(), ANALYZE_PROJECT_JOB_KIND, SEARCH_LYRICS_JOB_KIND], uuid7, utc_now
    )
    get_project = GetProject(projects, repo, analysis_cache)
    project_audio = ProjectsAudioSource(get_project)
    if with_analysis:
        handlers[ANALYZE_PROJECT_JOB_KIND] = _analysis_handler(settings, store, analyses, project_audio)
        handlers[SEARCH_LYRICS_JOB_KIND] = _lyrics_search_handler(settings, store, analyses, project_audio)
    get_project_analysis = GetProjectAnalysis(project_audio, analyses)
    return Container(
        settings=settings,
        enqueue_job=enqueue_job,
        get_job=GetJob(repo),
        run_job=RunJob(repo, handlers, utc_now),
        check_health=CheckHealth(settings.app_version, PostgresProbe(engine), RedisProbe(redis), S3Probe(settings)),
        create_project=CreateProject(projects, store, FfprobeAudioProbe(), analysis_cache, enqueue_job, uuid7, utc_now),
        get_project=get_project,
        analysis_cache=analysis_cache,
        get_project_analysis=get_project_analysis,
        get_project_audio=GetProjectAudio(projects, store),
        director=build_director(settings, store, get_project_analysis),
        accounts=build_accounts(
            settings,
            SqlAlchemyUserRepository(sessions),
            SqlAlchemyLoginTokenRepository(sessions),
            SqlAlchemySessionRepository(sessions),
            email_sender(settings),
        ),
        templates=build_templates(
            settings,
            SqlAlchemyStoreTemplateRepository(sessions),
            store,
            SqlAlchemyReportRepository(sessions),
            SqlAlchemyModerationAudit(sessions),
        ),
        upload_limiter=SlidingWindowLimiter(settings.upload_rate_limit_per_hour, 3600.0),
        check_project_access=CheckProjectAccess(projects),
        get_project_edits=GetProjectEdits(projects),
        save_project_edits=SaveProjectEdits(projects),
        engine=engine,
        redis=redis,
        handlers=handlers,
    )
