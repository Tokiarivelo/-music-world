'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useT } from '@/i18n';
import { createProject, getJob } from '../api/projects.api';
import {
  AUDIO_ACCEPT,
  AUDIO_EXTENSIONS,
  LRC_ACCEPT,
  MAX_AUDIO_BYTES,
  MAX_LRC_BYTES,
  PLAY_PATH,
} from '../consts/upload.consts';
import { useUpload, type UploadDeps } from '../hooks/use-upload';
import { checkFiles } from '../lib/stage-progress';
import { AnalysisProgress } from './AnalysisProgress';

const LIMITS = { maxAudioBytes: MAX_AUDIO_BYTES, maxLrcBytes: MAX_LRC_BYTES, extensions: AUDIO_EXTENSIONS };

/** Upload page body: pick a song (+ optional .lrc), follow the analysis per stage, then open `/play/<id>`. */
export function UploadForm({ deps }: { deps?: Partial<UploadDeps> }) {
  const router = useRouter();
  const onReady = useCallback((projectId: string) => router.push(PLAY_PATH(projectId)), [router]);
  const t = useT('upload');
  const upload = useUpload(useMemo(() => ({ createProject, getJob, onReady, ...deps }), [onReady, deps]));
  const [audio, setAudio] = useState<File | null>(null);
  const [lrc, setLrc] = useState<File | null>(null);
  const busy = upload.phase.kind === 'uploading' || upload.phase.kind === 'analysing';

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = checkFiles(audio, lrc, LIMITS);
    if (problem || !audio) upload.fail(problem ?? 'NO_FILE');
    else void upload.submit(audio, lrc);
  };

  return (
    <div className="w-full max-w-xl space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-[var(--mw-primary)] sm:text-4xl">{t('title')}</h1>
        <p className="text-sm opacity-80">{t('intro')}</p>
      </header>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <label className="block space-y-1 text-sm">
          <span>{t('audioLabel')}</span>
          <input
            type="file"
            name="audio"
            accept={AUDIO_ACCEPT}
            disabled={busy}
            onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[var(--mw-primary)] file:px-4 file:py-2 file:text-white"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('lrcLabel')}</span>
          <input
            type="file"
            name="lyrics"
            accept={LRC_ACCEPT}
            disabled={busy}
            onChange={(e) => setLrc(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-white/15 file:px-4 file:py-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[var(--mw-secondary)] px-6 py-3 font-medium text-black disabled:opacity-50"
        >
          {upload.phase.kind === 'uploading' ? t('uploading') : t('submit')}
        </button>
        <p className="text-center text-xs opacity-60">{t('royaltyNote')}</p>
        <p className="text-center text-xs opacity-60">{t('dataNote')}</p>
      </form>
      {upload.phase.kind === 'analysing' && <AnalysisProgress job={upload.job} />}
      {upload.phase.kind === 'ready' && <p role="status">{t('ready')}</p>}
      {upload.phase.kind === 'error' && (
        <p role="alert" className="text-[var(--mw-accent)]">
          {t.error(upload.phase.messageKey)}
        </p>
      )}
    </div>
  );
}
