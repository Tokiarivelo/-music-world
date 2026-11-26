'use client';

import { useId, useState } from 'react';
import { useT } from '@/i18n';
import { GLASS_PANEL } from '@/lib/glass';
import type { Template } from '@/templates/generated';
import { BUTTON, CONTROL } from '@/features/template-editor/consts/ui.consts';
import { createMap, PLATE_RANGE, SEED_MAX, type MapEnvironment } from '../lib/map-model';

const ENVIRONMENTS: readonly MapEnvironment[] = ['city', 'meadow', 'underwater'];

export interface CreateMapDialogProps {
  /** A template the map can start from (the one opened with `?from=`, or the default look); null: only empty plates. */
  source: Template | null;
  onCreate(map: Template): void;
}

/** The dialog of a new map: name, start (empty plate of an environment, or a copy of a template), plate size and seed. */
export function CreateMapDialog({ source, onCreate }: CreateMapDialogProps) {
  const t = useT('maps');
  const ids = { name: useId(), start: useId(), size: useId(), seed: useId() };
  const [name, setName] = useState('');
  const [start, setStart] = useState<MapEnvironment | 'copy'>('city');
  const [size, setSize] = useState(16);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids.name}-title`}
        className={`${GLASS_PANEL} flex w-full max-w-md flex-col gap-3 p-5 text-sm`}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(createMap({ name, from: start === 'copy' ? source : null, environment: start === 'copy' ? 'city' : start, plateSize: size, seed }));
        }}
      >
        <h1 id={`${ids.name}-title`} className="text-xl font-semibold">{t('create.title')}</h1>
        <label htmlFor={ids.name} className="flex flex-col gap-1">
          {t('create.name')}
          <input id={ids.name} className={CONTROL} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label htmlFor={ids.start} className="flex flex-col gap-1">
          {t('create.from')}
          <select id={ids.start} className={CONTROL} value={start} onChange={(e) => setStart(e.target.value as MapEnvironment | 'copy')}>
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>{`${t('create.empty')} · ${t(`env.${env}`)}`}</option>
            ))}
            {source && <option value="copy">{t('create.copy', { name: source.name })}</option>}
          </select>
        </label>
        {start !== 'copy' && (
          <label htmlFor={ids.size} className="flex flex-col gap-1">
            {t('create.size')}
            <input id={ids.size} type="number" className={CONTROL} min={PLATE_RANGE.min} max={PLATE_RANGE.max} step={1} value={size} onChange={(e) => setSize(e.target.valueAsNumber || PLATE_RANGE.min)} />
          </label>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor={ids.seed} className="flex flex-1 flex-col gap-1">
            {t('create.seed')}
            <input id={ids.seed} type="number" className={CONTROL} min={0} max={SEED_MAX} step={1} value={seed} onChange={(e) => setSeed(Math.round(e.target.valueAsNumber || 0))} />
          </label>
          <button type="button" className={BUTTON} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>{t('create.randomSeed')}</button>
        </div>
        <button type="submit" className={`${BUTTON} self-end bg-[var(--mw-secondary)] text-black`}>{t('create.submit')}</button>
      </form>
    </div>
  );
}
