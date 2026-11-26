'use client';

import { useT } from '@/i18n';
import type { Zone } from '../consts/template-editor.consts';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { removeZone, setZoneBound, updateZone, type ZoneBound } from '../lib/editor-model';
import { firstError } from '../lib/editor-validate';
import { KindSelect } from './KindSelect';
import { applyZonePreset, coveragePercent, presetOf, ZONE_PRESETS, type ZonePreset } from '../lib/zone-model';
import { NumberInput } from './fields/NumberInput';
import { SelectInput } from './fields/SelectInput';

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
      <SelectInput
        label={`${t('zone.title', { n })} · ${t('zone.preset')}`}
        value={presetOf(zone) ?? 'custom'}
        options={[
          ...(presetOf(zone) ? [] : [{ value: 'custom', label: t('zone.preset.custom') }]),
          ...ZONE_PRESETS.map((p) => ({ value: p, label: t(`zone.preset.${p}`) })),
        ]}
        onChange={(v) => v !== 'custom' && update((d) => updateZone(d, index, (z) => applyZonePreset(z, v as ZonePreset)))}
      />
      <p className="text-xs opacity-70">{t('zone.covers', { percent: coveragePercent(zone) })}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KindSelect
          label={`${t('zone.title', { n })} · ${t('zone.kind')}`}
          value={zone.kind}
          hint={t('zone.hint.kind')}
          recipes={draft.recipes}
          error={firstError(errors, `zones.${index}.kind`)}
          onChange={(kind) => update((d) => updateZone(d, index, (z) => ({ ...z, kind })))}
        />
        {BOUNDS.map((bound) => (
          <NumberInput
            key={bound}
            label={`${t('zone.title', { n })} · ${t(`zone.${bound}`)}`}
            field="zone.bound"
            hint={t(`zone.hint.${bound}`)}
            value={zone[bound]}
            error={firstError(errors, `zones.${index}.${bound}`)}
            onChange={(v) => update((d) => setZoneBound(d, index, bound, v))}
          />
        ))}
      </div>
    </li>
  );
}
