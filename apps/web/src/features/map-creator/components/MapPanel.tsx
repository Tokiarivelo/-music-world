'use client';

import { useId, useMemo } from 'react';
import { useT } from '@/i18n';
import type { Template } from '@/templates/generated';
import { BUTTON, CONTROL, templateObjects } from '@/features/template-editor';
import { MAX_PLACED, placedOf, type PlacedObject } from '../lib/map-model';
import type { MapTool } from './MapCanvas';

/** Kinds every map can place besides what its template uses. */
const BASIC_KINDS = ['tree', 'conifer', 'bush', 'building', 'car', 'crystal', 'spike', 'cloud'] as const;
export const SNAP_CHOICES = [0, 0.5, 1, 2] as const;

export function kindChoices(template: Template): string[] {
  return [...new Set([...templateObjects(template).map((o) => o.kind as string), ...BASIC_KINDS])];
}

export interface MapPanelProps {
  template: Template;
  tool: MapTool;
  kind: string;
  snap: number;
  selection: readonly string[];
  canUndo: boolean;
  canRedo: boolean;
  onTool(tool: MapTool): void;
  onKind(kind: string): void;
  onSnap(snap: number): void;
  onUndo(): void;
  onRedo(): void;
  onSelectAll(): void;
  onDelete(): void;
  onCopy(): void;
  onArray(count: number, step: number, axis: 'x' | 'z'): void;
  onEdit(change: Partial<Omit<PlacedObject, 'id'>>): void;
  onReplaceKind(kind: string): void;
}

function Field({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-xs opacity-80">{label}</label>
      <input id={id} type="number" className={`${CONTROL} w-full`} min={min} max={max} step={step} value={Number(value.toFixed(2))} onChange={(e) => { if (e.target.value !== '') onChange(e.target.valueAsNumber); }} />
    </div>
  );
}

/** Tools, the object to place, snapping, undo / redo and the inspector of the selected object(s). */
export function MapPanel(p: MapPanelProps) {
  const t = useT('maps');
  const kinds = useMemo(() => kindChoices(p.template), [p.template]);
  const placed = placedOf(p.template);
  const one = p.selection.length === 1 ? placed.find((o) => o.id === p.selection[0]) ?? null : null;
  const kindId = useId();
  const snapId = useId();
  const editKindId = useId();
  const arrayCount = useId();
  const arrayStep = useId();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('tool.label')}>
        {(['place', 'select'] as const).map((tool) => (
          <button key={tool} type="button" className={`${BUTTON} ${p.tool === tool ? 'bg-white/20' : ''}`} aria-pressed={p.tool === tool} onClick={() => p.onTool(tool)}>
            {t(`tool.${tool}`)}
          </button>
        ))}
        <button type="button" className={BUTTON} disabled={!p.canUndo} onClick={p.onUndo}>{t('action.undo')}</button>
        <button type="button" className={BUTTON} disabled={!p.canRedo} onClick={p.onRedo}>{t('action.redo')}</button>
      </div>
      <label htmlFor={kindId} className="flex flex-col gap-1">
        {t('kind')}
        <select id={kindId} className={CONTROL} value={p.kind} onChange={(e) => p.onKind(e.target.value)}>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <label htmlFor={snapId} className="flex flex-col gap-1">
        {t('snap')}
        <select id={snapId} className={CONTROL} value={p.snap} onChange={(e) => p.onSnap(Number(e.target.value))}>
          {SNAP_CHOICES.map((s) => <option key={s} value={s}>{s === 0 ? t('snap.off') : `${s} m`}</option>)}
        </select>
      </label>
      <p className="text-xs opacity-70">{p.tool === 'place' ? t('canvas.hint.place', { kind: p.kind }) : t('canvas.hint.select')}</p>
      <p className="text-xs opacity-70">{placed.length >= MAX_PLACED ? t('full') : t('count', { count: placed.length, max: MAX_PLACED })}</p>

      <fieldset className="flex flex-col gap-2 rounded-2xl border border-white/15 p-3">
        <legend className="px-1 text-xs opacity-80">
          {p.selection.length === 0 ? t('selection.none') : one ? t('selection.one', { id: one.id }) : t('selection.count', { count: p.selection.length })}
        </legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={p.onSelectAll} disabled={placed.length === 0}>{t('action.selectAll')}</button>
          <button type="button" className={BUTTON} onClick={p.onCopy} disabled={p.selection.length === 0 || placed.length >= MAX_PLACED}>{t('action.copy')}</button>
          <button type="button" className={BUTTON} onClick={p.onDelete} disabled={p.selection.length === 0}>{t('action.delete')}</button>
        </div>
        {p.selection.length > 0 && (
          <label htmlFor={editKindId} className="flex flex-col gap-1">
            {t('field.kind')}
            <select id={editKindId} className={CONTROL} value={one?.kind ?? ''} onChange={(e) => p.onReplaceKind(e.target.value)}>
              {one ? null : <option value="" disabled>…</option>}
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        )}
        {one && (
          <>
            <div className="flex gap-2">
              <Field label={t('field.x')} value={one.x} min={-64} max={64} step={0.1} onChange={(v) => p.onEdit({ x: v })} />
              <Field label={t('field.z')} value={one.z} min={-64} max={64} step={0.1} onChange={(v) => p.onEdit({ z: v })} />
            </div>
            <div className="flex gap-2">
              <Field label={t('field.yaw')} value={one.yaw} min={-180} max={180} step={1} onChange={(v) => p.onEdit({ yaw: v })} />
              <Field label={t('field.scale')} value={one.scale} min={0.2} max={5} step={0.1} onChange={(v) => p.onEdit({ scale: v })} />
              <Field label={t('field.variant')} value={one.variant} min={0} max={15} step={1} onChange={(v) => p.onEdit({ variant: v })} />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-xs opacity-80">
                {t('field.color')}
                <input type="color" className="h-8 w-14 rounded border border-white/20 bg-transparent" value={one.color ?? '#ffffff'} onChange={(e) => p.onEdit({ color: e.target.value })} />
              </label>
              <button type="button" className={BUTTON} disabled={one.color === null} onClick={() => p.onEdit({ color: null })}>{t('action.clearColor')}</button>
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                p.onArray(Number(f.get('count')), Number(f.get('step')), f.get('axis') === 'z' ? 'z' : 'x');
              }}
            >
              <div className="flex w-16 flex-col gap-1"><label htmlFor={arrayCount} className="text-xs opacity-80">{t('array.count')}</label><input id={arrayCount} name="count" type="number" min={1} max={50} defaultValue={3} className={CONTROL} /></div>
              <div className="flex w-20 flex-col gap-1"><label htmlFor={arrayStep} className="text-xs opacity-80">{t('array.step')}</label><input id={arrayStep} name="step" type="number" min={0.2} max={20} step={0.1} defaultValue={2} className={CONTROL} /></div>
              <select name="axis" aria-label={t('array.axis')} className={CONTROL} defaultValue="x"><option value="x">{t('array.x')}</option><option value="z">{t('array.z')}</option></select>
              <button type="submit" className={BUTTON}>{t('action.array')}</button>
            </form>
          </>
        )}
      </fieldset>
    </div>
  );
}
