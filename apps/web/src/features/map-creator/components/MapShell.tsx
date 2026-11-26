'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AUTH_ROUTES, useSession } from '@/features/auth';
import { PreviewPlayback } from '@/features/player';
import { useEditorSource } from '@/features/template-editor/hooks/use-editor-source';
import { useT } from '@/i18n';
import { GLASS_PANEL, GLASS_PILL } from '@/lib/glass';
import type { Template } from '@/templates/generated';
import { BUTTON } from '@/features/template-editor/consts/ui.consts';
import { useMapDraft } from '../hooks/use-map-draft';
import { useSaveMap } from '../hooks/use-save-map';
import { clearMapDraft, parseMapDraft, readRawMapDraft, saveMapDraft } from '../lib/map-draft-storage';
import { arrayPlaced, copyPlaced, placedOf, placeObject, removePlaced, replaceKind, updatePlaced, type PlacedObject } from '../lib/map-model';
import { CreateMapDialog } from './CreateMapDialog';
import { MapCanvas, type MapTool } from './MapCanvas';
import { MapPanel } from './MapPanel';

const PANEL_ID = 'map-panel';
const GLASS_BUTTON = `${GLASS_PILL} px-3 py-1 text-sm hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]`;

const AUTOSAVE_MS = 400;

function MapEditor({ initial, initialId = null, fromBrowser = false, source, onDiscard }: { initial: Template | null; initialId?: string | null; fromBrowser?: boolean; source: Template | null; onDiscard(): void }) {
  const t = useT('maps');
  const draft = useMapDraft(initial);
  const session = useSession();
  const saver = useSaveMap(initialId);
  const restored = fromBrowser;
  const { template: current0 } = draft;
  const { savedId } = saver;
  useEffect(() => {
    if (!current0) return;
    const timer = setTimeout(() => saveMapDraft(current0, savedId), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [current0, savedId]);
  const [open, setOpen] = useState(true);
  const [tool, setTool] = useState<MapTool>('place');
  const [kind, setKind] = useState('tree');
  const [snap, setSnap] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [preview, setPreview] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const shown = preview ?? draft.template;
  if (!shown || !draft.template) return <CreateMapDialog source={source} onCreate={(m) => { draft.open(m); setSelection([]); }} />;
  const current = draft.template;
  const edit = (change: Partial<Omit<PlacedObject, 'id'>>) => draft.apply((m) => selection.reduce((acc, id) => updatePlaced(acc, id, change), m));
  const live = new Set(placedOf(current).map((o) => o.id));
  const sel = selection.filter((id) => live.has(id));
  const remove = () => { draft.apply((m) => removePlaced(m, sel)); setSelection([]); };
  return (
    <div className="relative h-dvh overflow-hidden">
      <section className="absolute inset-0 flex items-center justify-center p-3 lg:pl-[29rem]" aria-label={t('title')}>
        <MapCanvas
          template={shown}
          selection={sel}
          tool={tool}
          snap={snap}
          onPlace={(x, z) => {
            const placed = placeObject(current, kind as PlacedObject['kind'], x, z, { snap });
            if (placed.id) { draft.set(placed.template); setSelection([placed.id]); }
          }}
          onSelect={setSelection}
          onPreview={setPreview}
          onCommit={(next) => draft.set(next)}
          onDelete={remove}
        />
      </section>
      {previewing && (
        <div className="absolute inset-0 z-40 bg-[var(--mw-bg)]" role="region" aria-label={t('preview.label')}>
          <PreviewPlayback template={current} />
          <button type="button" className={`${GLASS_BUTTON} absolute left-3 top-3 z-50`} onClick={() => setPreviewing(false)}>{t('preview.back')}</button>
        </div>
      )}
      {!open && <button type="button" className={`${GLASS_BUTTON} absolute left-3 top-3 z-30`} aria-expanded={false} aria-controls={PANEL_ID} onClick={() => setOpen(true)}>{t('panel.show')}</button>}
      <aside
        id={PANEL_ID}
        aria-label={t('panel.label')}
        aria-hidden={!open}
        inert={!open}
        className={`${GLASS_PANEL} absolute bottom-3 left-3 top-3 z-20 flex w-[min(26rem,calc(100%-1.5rem))] flex-col gap-3 overflow-y-auto p-4 transition-transform duration-300 motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <Link href="/play/demo" className="text-sm underline">{t('back')}</Link>
          <button type="button" className={GLASS_BUTTON} aria-expanded={open} aria-controls={PANEL_ID} onClick={() => setOpen(false)}>{t('panel.hide')}</button>
        </div>
        <h1 className="text-xl font-semibold">{current.name}</h1>
        {restored && (
          <p role="status" className="flex flex-wrap items-center gap-2 text-xs opacity-80">
            {t('draft.restored')}
            <button type="button" className="underline" onClick={() => { clearMapDraft(); onDiscard(); }}>{t('draft.discard')}</button>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={GLASS_BUTTON} onClick={() => setPreviewing(true)}>{t('preview')}</button>
          {session.user !== null ? (
            <button type="button" className={BUTTON} disabled={saver.status === 'saving'} onClick={() => saver.save(current)}>
              {saver.status === 'saving' ? t('save.saving') : t('save')}
            </button>
          ) : (
            <Link className={BUTTON} href={AUTH_ROUTES.signIn}>{t('save.signIn')}</Link>
          )}
        </div>
        <div role="status" className="text-xs">
          {saver.status === 'saved' && t('save.done', { name: current.name })}
        </div>
        {saver.status === 'error' && <p role="alert" className="text-xs text-[var(--mw-accent)]">{t('save.error', { reason: t.error(saver.errorKey) })}</p>}
        <p className="text-sm opacity-80">{t('intro')}</p>
        <MapPanel
          template={current}
          tool={tool}
          kind={kind}
          snap={snap}
          selection={sel}
          canUndo={draft.canUndo}
          canRedo={draft.canRedo}
          onTool={setTool}
          onKind={setKind}
          onSnap={setSnap}
          onUndo={draft.undo}
          onRedo={draft.redo}
          onSelectAll={() => setSelection(placedOf(current).map((o) => o.id))}
          onDelete={remove}
          onCopy={() => { const c = copyPlaced(current, sel, 1, 1); draft.set(c.template); setSelection(c.ids); }}
          onArray={(count, step, axis) => {
            const id = sel[0];
            if (!id) return;
            const a = arrayPlaced(current, id, count, axis === 'x' ? step : 0, axis === 'z' ? step : 0);
            draft.set(a.template);
            setSelection([id, ...a.ids]);
          }}
          onEdit={edit}
          onReplaceKind={(k) => draft.apply((m) => replaceKind(m, sel, k as PlacedObject['kind']))}
        />
      </aside>
    </div>
  );
}

const noopSubscribe = (): (() => void) => () => undefined;

/** The map kept in this browser: nothing on the server render, read on the client (so hydration never mismatches). */
function useBrowserDraft() {
  const raw = useSyncExternalStore(noopSubscribe, () => readRawMapDraft(), () => null);
  return useMemo(() => parseMapDraft(raw), [raw]);
}

/** `/maps?from=<id>` (start from a template) or `/maps?open=<id>` (reopen a saved map): place and edit objects on it. */
export function MapShell({ from, open = null }: { from: string | null; open?: string | null }) {
  const t = useT('maps');
  const source = useEditorSource(open ?? from);
  const stored = useBrowserDraft();
  const [discarded, setDiscarded] = useState(0);
  if (source.status === 'ready') {
    const key = `${source.source.id}:${stored ? 'draft' : 'new'}:${discarded}`;
    const onDiscard = () => setDiscarded((n) => n + 1);
    // The browser draft wins, unless it is another saved map than the one asked for.
    if (stored && !discarded && (!open || stored.savedId === open)) {
      return <MapEditor key={key} initial={stored.template} initialId={stored.savedId} fromBrowser source={open ? null : source.source} onDiscard={onDiscard} />;
    }
    if (open) return <MapEditor key={key} initial={source.source} initialId={open} source={null} onDiscard={onDiscard} />;
    return <MapEditor key={key} initial={null} source={source.source} onDiscard={onDiscard} />;
  }
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center">
      {source.status === 'loading' ? <p role="status">…</p> : <button type="button" className="rounded-full border border-white/30 px-4 py-2" onClick={source.fallbackToDefault}>{t('back')}</button>}
    </div>
  );
}
