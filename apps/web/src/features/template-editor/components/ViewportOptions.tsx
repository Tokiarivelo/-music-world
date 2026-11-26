'use client';

import { useT } from '@/i18n';
import { CONTROL, FOCUS } from '../consts/ui.consts';
import { MOVE_STEPS, ROTATE_STEPS, SCALE_STEPS, SHADINGS, VIEWS } from '../consts/workspace.consts';
import type { StageSettings, StageView } from '../lib/object-stage';
import { ToolButton } from './ToolButton';

export interface ViewportOptionsProps {
  settings: StageSettings;
  snapOn: boolean;
  onChange(patch: Partial<StageSettings>): void;
  onSnap(on: boolean): void;
  onView(view: Exclude<StageView, 'free'>): void;
  onFrame(): void;
}

const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${FOCUS} ${on ? 'border-[var(--mw-accent)] bg-[var(--mw-accent)]/25' : 'border-white/25 hover:bg-white/10'}`;

function StepSelect({ label, value, steps, onChange }: { label: string; value: number; steps: readonly number[]; onChange(v: number): void }) {
  return (
    <label className="flex items-center gap-1 text-xs opacity-90">
      {label}
      <select className={`${CONTROL} !py-0.5 text-xs`} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {steps.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}

/** Camera views, shading, overlays and snapping: what changes how the object is seen, not the object. */
export function ViewportOptions({ settings, snapOn, onChange, onSnap, onView, onFrame }: ViewportOptionsProps) {
  const t = useT('editor');
  return (
    <div className="flex flex-col items-end gap-2 text-sm" role="toolbar" aria-label={t('workspace.view')}>
      <div className="flex flex-wrap justify-end gap-1 rounded-xl border border-white/15 bg-[var(--mw-bg)]/85 p-1.5 backdrop-blur">
        {VIEWS.map((v) => (
          <button key={v} type="button" className={chip(false)} onClick={() => onView(v)}>
            {t(`workspace.view.${v}`)}
          </button>
        ))}
        <button type="button" className={chip(settings.ortho)} aria-pressed={settings.ortho} title="5" onClick={() => onChange({ ortho: !settings.ortho })}>
          {t(settings.ortho ? 'workspace.ortho' : 'workspace.persp')}
        </button>
      </div>
      <div className="flex flex-wrap justify-end gap-1 rounded-xl border border-white/15 bg-[var(--mw-bg)]/85 p-1.5 backdrop-blur">
        {SHADINGS.map((s) => (
          <button key={s} type="button" className={chip(settings.shading === s)} aria-pressed={settings.shading === s} onClick={() => onChange({ shading: s })}>
            {t(`workspace.shading.${s}`)}
          </button>
        ))}
        <button type="button" className={chip(settings.edges)} aria-pressed={settings.edges} onClick={() => onChange({ edges: !settings.edges })}>{t('workspace.edges')}</button>
        <button type="button" className={chip(settings.grid)} aria-pressed={settings.grid} onClick={() => onChange({ grid: !settings.grid })}>{t('workspace.grid')}</button>
        <button type="button" className={chip(settings.isolate)} aria-pressed={settings.isolate} title="/" onClick={() => onChange({ isolate: !settings.isolate })}>{t('workspace.isolate')}</button>
        <button type="button" className={chip(settings.space === 'world')} aria-pressed={settings.space === 'world'} title="T" onClick={() => onChange({ space: settings.space === 'world' ? 'local' : 'world' })}>
          {t(settings.space === 'world' ? 'workspace.spaceWorld' : 'workspace.spaceLocal')}
        </button>
        <ToolButton icon="frame" label={t('workspace.frame')} keys="F" onClick={onFrame} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-white/15 bg-[var(--mw-bg)]/85 px-2 py-1.5 backdrop-blur">
        <button type="button" className={chip(snapOn)} aria-pressed={snapOn} aria-keyshortcuts="Shift+S" onClick={() => onSnap(!snapOn)}>{t('workspace.snap')}</button>
        <StepSelect label={t('workspace.snapMove')} value={settings.snap.move || MOVE_STEPS[1]!} steps={MOVE_STEPS} onChange={(move) => onChange({ snap: { ...settings.snap, move } })} />
        <StepSelect label={t('workspace.snapRotate')} value={settings.snap.rotate || ROTATE_STEPS[1]!} steps={ROTATE_STEPS} onChange={(rotate) => onChange({ snap: { ...settings.snap, rotate } })} />
        <StepSelect label={t('workspace.snapScale')} value={settings.snap.scale || SCALE_STEPS[1]!} steps={SCALE_STEPS} onChange={(scale) => onChange({ snap: { ...settings.snap, scale } })} />
      </div>
    </div>
  );
}
