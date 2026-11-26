'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/features/auth';
import { useT } from '@/i18n';
import { readStashedTemplate, UNSAVED_KEY } from '@/lib/template-stash';
import type { Template } from '@/templates/generated';
import { useEditorSource } from '../hooks/use-editor-source';
import { useSaveTemplate } from '../hooks/use-save-template';
import { useTemplateDraft } from '../hooks/use-template-draft';
import { createDraftStore, type DraftStore } from '../store/template-draft.store';
import { EditorActions } from './EditorActions';
import { EditorForm } from './EditorForm';
import { InventoryPanel } from './InventoryPanel';
import { WorldPreview } from './WorldPreview';

function createStore(source: Template): DraftStore {
  const store = createDraftStore(source);
  const unsaved = readStashedTemplate(UNSAVED_KEY); // the document kept across the sign-in round trip
  if (unsaved) store.update(() => unsaved);
  return store;
}

function Editor({ source, projectId }: { source: Template; projectId: string | null }) {
  const t = useT('editor');
  const [store] = useState(() => createStore(source));
  const [selected, setSelected] = useState<string | null>(null);
  const state = useTemplateDraft(store);
  const session = useSession();
  const saver = useSaveTemplate(store);
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <section className="flex flex-col gap-3 overflow-y-auto p-4 lg:w-[28rem] lg:shrink-0">
        <Link href="/play/demo" className="text-sm underline">
          {t('back')}
        </Link>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm opacity-80">{t('source', { name: state.source.name })}</p>
        <EditorActions state={state} signedIn={session.user !== null} saver={saver} onReset={store.reset} />
        <InventoryPanel draft={state.draft} selected={selected} onSelect={setSelected} />
        <EditorForm draft={state.draft} errors={state.errors} update={store.update} />
      </section>
      <section className="relative h-[70dvh] min-h-80 flex-1 [contain:layout_paint] lg:h-auto" aria-label={t('previewLabel')}>
        <WorldPreview state={state} projectId={projectId} />
        {state.errors.length > 0 && (
          <p className="absolute left-3 top-3 z-10 rounded bg-[var(--mw-bg)]/80 px-3 py-1 text-xs">{t('previewNote')}</p>
        )}
      </section>
    </div>
  );
}

/** `/editor?from=<id>&project=<id>`: loads the source, then the form, the live preview and the actions. */
export function EditorShell({ from, projectId }: { from: string | null; projectId: string | null }) {
  const t = useT('editor');
  const source = useEditorSource(from);
  if (source.status === 'ready') return <Editor key={source.source.id} source={source.source} projectId={projectId} />;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      {source.status === 'loading' ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          <p role="alert">{t('loadError')}</p>
          <button type="button" className="rounded-full border border-white/30 px-4 py-2" onClick={source.fallbackToDefault}>
            {t('useDefault')}
          </button>
        </>
      )}
    </div>
  );
}
