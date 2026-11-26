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
import { ObjectEditor } from './ObjectEditor';
import { WorldPreview } from './WorldPreview';

const PANEL_ID = 'editor-panel';
/** iOS-like glass: translucent, the world behind it blurred and slightly saturated. */
const GLASS_PANEL =
  'rounded-3xl border border-white/20 bg-[color-mix(in_srgb,var(--mw-bg)_38%,transparent)] shadow-2xl backdrop-blur-2xl backdrop-saturate-150';
const GLASS_BUTTON =
  'rounded-full border border-white/25 bg-[color-mix(in_srgb,var(--mw-bg)_38%,transparent)] px-3 py-1 text-sm backdrop-blur-xl hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]';

function createStore(source: Template): DraftStore {
  const store = createDraftStore(source);
  const unsaved = readStashedTemplate(UNSAVED_KEY); // the document kept across the sign-in round trip
  if (unsaved) store.update(() => unsaved);
  return store;
}

function Editor({ source, projectId }: { source: Template; projectId: string | null }) {
  const t = useT('editor');
  const [store] = useState(() => createStore(source));
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const state = useTemplateDraft(store);
  const session = useSession();
  const saver = useSaveTemplate(store);
  return (
    <div className="relative h-dvh overflow-hidden">
      <section className="absolute inset-0 [contain:layout_paint]" aria-label={t('previewLabel')}>
        <WorldPreview state={state} projectId={projectId} />
        {state.errors.length > 0 && (
          <p className="absolute right-3 top-3 z-10 rounded bg-[var(--mw-bg)]/80 px-3 py-1 text-xs">{t('previewNote')}</p>
        )}
      </section>
      {!open && (
        <button type="button" className={`${GLASS_BUTTON} absolute left-3 top-3 z-30`} aria-expanded={false} aria-controls={PANEL_ID} onClick={() => setOpen(true)}>
          {t('panel.show')}
        </button>
      )}
      <aside
        id={PANEL_ID}
        aria-label={t('panel.label')}
        aria-hidden={!open}
        inert={!open}
        className={`${GLASS_PANEL} absolute bottom-3 left-3 top-3 z-20 flex w-[min(28rem,calc(100%-1.5rem))] flex-col gap-3 overflow-y-auto p-4 transition-transform duration-300 motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <Link href="/play/demo" className="text-sm underline">
            {t('back')}
          </Link>
          <button type="button" className={GLASS_BUTTON} aria-expanded={open} aria-controls={PANEL_ID} onClick={() => setOpen(false)}>
            {t('panel.hide')}
          </button>
        </div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm opacity-80">{t('source', { name: state.source.name })}</p>
        <EditorActions state={state} signedIn={session.user !== null} saver={saver} onReset={store.reset} />
        <InventoryPanel draft={state.draft} selected={selected} onSelect={setSelected} />
        {selected && <ObjectEditor key={selected} draft={state.draft} update={store.update} kind={selected} onSelectKind={setSelected} />}
        <EditorForm draft={state.draft} errors={state.errors} update={store.update} />
      </aside>
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
