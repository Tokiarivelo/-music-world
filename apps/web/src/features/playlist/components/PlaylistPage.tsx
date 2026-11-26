'use client';

import Link from 'next/link';
import { useT } from '@/i18n';
import { usePlaylist } from '../hooks/use-playlist';
import type { PlaylistEntry } from '../lib/playlist-store';

export const playPath = (e: Pick<PlaylistEntry, 'id' | 'templateRef'>): string => {
  const base = e.id === 'demo' ? '/play/demo' : `/play/${encodeURIComponent(e.id)}`;
  return e.templateRef ? `${base}?template=${encodeURIComponent(e.templateRef)}` : base;
};

const minutes = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** `/playlist`: the songs this user played, saved in this browser only. */
export function PlaylistPage() {
  const t = useT('common');
  const { entries, remove, ready } = usePlaylist();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-[var(--mw-primary)]">{t('playlist.title')}</h1>
        <p className="text-sm opacity-70">{t('playlist.private')}</p>
      </header>
      {ready && entries.length === 0 && <p className="opacity-80">{t('playlist.empty')}</p>}
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <Link href={playPath(e)} className="min-w-0 flex-1">
              <span className="block truncate font-medium">{e.title}</span>
              <span className="block truncate text-xs opacity-70">
                {[e.key, e.tempoBpm ? `${Math.round(e.tempoBpm)} BPM` : null, e.durationSec ? minutes(e.durationSec) : null, t('playlist.plays', { count: e.plays })]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Link>
            <Link href={playPath(e)} className="rounded-full bg-[var(--mw-secondary)] px-4 py-1.5 text-sm font-medium text-black">
              {t('playlist.play')}
            </Link>
            <button type="button" onClick={() => remove(e.id)} className="rounded-full px-3 py-1.5 text-sm hover:bg-white/10" aria-label={t('playlist.remove', { title: e.title })}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
