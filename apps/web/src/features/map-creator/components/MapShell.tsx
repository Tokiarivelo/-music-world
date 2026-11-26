'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useEditorSource } from '@/features/template-editor/hooks/use-editor-source';
import { useT } from '@/i18n';
import { GLASS_PANEL, GLASS_PILL } from '@/lib/glass';
import type { Template } from '@/templates/generated';
import { useMapDraft } from '../hooks/use-map-draft';
import { arrayPlaced, copyPlaced, placedOf, placeObject, removePlaced, replaceKind, updatePlaced, type PlacedObject } from '../lib/map-model';
import { CreateMapDialog } from './CreateMapDialog';
import { MapCanvas, type MapTool } from './MapCanvas';
import { MapPanel } from './MapPanel';

const PANEL_ID = 'map-panel';
const GLASS_BUTTON = `${GLASS_PILL} px-3 py-1 text-sm hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]`;

function MapEditor({ initial, source }: { initial: Template | null; source: Template | null }) {
  const t = useT('maps');
  const draft = useMapDraft(initial);
  const [open, setOpen] = useState(true);
  const [tool, setTool] = useState<MapTool>('place');
  const [kind, setKind] = useState('tree');
  const [snap, setSnap] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [preview, setPreview] = useState<Template | null>(null);
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

/** `/maps?from=<id>`: create a map (empty plate or a copy of a template), then place and edit objects on it. */
export function MapShell({ from }: { from: string | null }) {
  const t = useT('maps');
  const source = useEditorSource(from);
  if (source.status === 'ready') return <MapEditor key={source.source.id} initial={null} source={source.source} />;
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center">
      {source.status === 'loading' ? <p role="status">…</p> : <button type="button" className="rounded-full border border-white/30 px-4 py-2" onClick={source.fallbackToDefault}>{t('back')}</button>}
    </div>
  );
}
