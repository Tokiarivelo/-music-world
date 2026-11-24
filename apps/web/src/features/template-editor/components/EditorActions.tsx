'use client';

import Link from 'next/link';
import { AUTH_ROUTES } from '@/features/auth';
import { useT } from '@/i18n';
import { stashTemplate, UNSAVED_KEY } from '@/lib/template-stash';
import { BUTTON } from '../consts/ui.consts';
import type { SaveState } from '../hooks/use-save-template';
import type { DraftState } from '../interfaces/template-editor.types';
import { downloadTemplate } from '../lib/download-template';

interface EditorActionsProps {
  state: DraftState;
  signedIn: boolean;
  saver: SaveState;
  onReset(): void;
}

/** Save draft, Publish, Reset and Download JSON; signed-out visitors can edit and download, and sign in to save. */
export function EditorActions({ state, signedIn, saver, onReset }: EditorActionsProps) {
  const t = useT('editor');
  const invalid = state.errors.length > 0;
  const busy = saver.status === 'saving' || saver.status === 'publishing';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {signedIn ? (
          <>
            <button type="button" className={BUTTON} disabled={invalid || busy} onClick={saver.save}>
              {saver.status === 'saving' ? t('action.saving') : t('action.save')}
            </button>
            <button type="button" className={BUTTON} disabled={invalid || busy} onClick={saver.publish}>
              {saver.status === 'publishing' ? t('action.publishing') : t('action.publish')}
            </button>
          </>
        ) : (
          <Link className={BUTTON} href={AUTH_ROUTES.signIn} onClick={() => stashTemplate(state.draft, UNSAVED_KEY)}>
            {t('action.signIn')}
          </Link>
        )}
        <button type="button" className={BUTTON} disabled={invalid} onClick={() => downloadTemplate(state.draft)}>
          {t('action.download')}
        </button>
        <button type="button" className={BUTTON} onClick={onReset}>
          {t('action.reset')}
        </button>
      </div>
      <div role="status" className="text-sm">
        {saver.status === 'saved' && t('action.saved')}
        {saver.status === 'published' && (
          <>
            {t('action.published')} ·{' '}
            <Link className="underline" href="/templates">
              {t('action.viewStore')}
            </Link>
          </>
        )}
        {saver.status === 'idle' && state.dirty && t('action.unsaved')}
      </div>
      {saver.status === 'error' && (
        <p role="alert" className="text-sm text-[var(--mw-accent)]">
          {t.error(saver.errorKey)}
        </p>
      )}
    </div>
  );
}
