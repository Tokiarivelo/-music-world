'use client';

import { useT } from '@/i18n';
import type { Zone } from '../consts/template-editor.consts';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { removeZone, setZoneBound, updateZone, type ZoneBound } from '../lib/editor-model';
import { firstError } from '../lib/editor-validate';
import { KindSelect } from './KindSelect';
import { NumberInput } from './fields/NumberInput';

const BOUNDS: readonly ZoneBound[] = ['xMin', 'xMax', 'zMin', 'zMax'];

interface ZoneEditorProps extends SectionProps {
  index: number;
  zone: Zone;
}

export function ZoneEditor({ draft, errors, update, index, zone }: ZoneEditorProps) {
  const t = useT('editor');
  const n = index + 1;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('zone.title', { n })}</h4>
        <button type="button" className={BUTTON} aria-label={t('zone.remove', { n })} onClick={() => update((d) => removeZone(d, index))}>
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KindSelect
          label={`${t('zone.title', { n })} · ${t('zone.kind')}`}
          value={zone.kind}
          recipes={draft.recipes}
          error={firstError(errors, `zones.${index}.kind`)}
          onChange={(kind) => update((d) => updateZone(d, index, (z) => ({ ...z, kind })))}
        />
        {BOUNDS.map((bound) => (
          <NumberInput
            key={bound}
            label={`${t('zone.title', { n })} · ${t(`zone.${bound}`)}`}
            field="zone.bound"
            value={zone[bound]}
            error={firstError(errors, `zones.${index}.${bound}`)}
            onChange={(v) => update((d) => setZoneBound(d, index, bound, v))}
          />
        ))}
      </div>
    </li>
  );
}
