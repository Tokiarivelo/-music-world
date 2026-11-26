'use client';

import { useT } from '@/i18n';
import { BUTTON } from '../consts/ui.consts';
import { SHORTCUT_LIST } from '../lib/shortcuts';

/** The shortcut sheet (`?`): one row per command. */
export function ShortcutHelp({ onClose }: { onClose(): void }) {
  const t = useT('editor');
  return (
    <div role="dialog" aria-modal="false" aria-label={t('workspace.shortcuts')} className="absolute left-1/2 top-16 z-30 w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-white/20 bg-[var(--mw-bg)]/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('workspace.shortcuts')}</h2>
        <button type="button" className={BUTTON} onClick={onClose}>{t('workspace.close')}</button>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {SHORTCUT_LIST.map(({ keys, command }) => (
          <div key={command} className="flex items-center justify-between gap-2">
            <dt className="opacity-80">{t(`workspace.cmd.${command}`)}</dt>
            <dd><kbd className="rounded border border-white/30 px-1.5 py-0.5 text-xs">{keys}</kbd></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
