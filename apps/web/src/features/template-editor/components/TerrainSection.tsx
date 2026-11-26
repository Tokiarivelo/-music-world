'use client';

import { useT } from '@/i18n';
import type { SectionProps } from '../interfaces/section.types';
import { setNumber, setOption } from '../lib/editor-model';
import { firstError } from '../lib/editor-validate';
import { NumberInput } from './fields/NumberInput';
import { Section } from './fields/Section';
import { SelectInput } from './fields/SelectInput';

export function TerrainSection({ draft, errors, update }: SectionProps) {
  const t = useT('editor');
  const { style, mountains, size } = draft.terrain;
  return (
    <Section title={t('section.terrain')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectInput
          label={t('terrain.style')}
          hint={t('hint.terrain.style')}
          value={style}
          options={[
            { value: 'cracked_plate', label: t('opt.cracked_plate') },
            { value: 'smooth_plate', label: t('opt.smooth_plate') },
          ]}
          error={firstError(errors, 'terrain.style')}
          onChange={(v) => update((d) => setOption(d, 'terrain', 'style', v as typeof style))}
        />
        <SelectInput
          label={t('terrain.mountains')}
          hint={t('hint.terrain.mountains')}
          value={mountains}
          options={[
            { value: 'edges', label: t('opt.edges') },
            { value: 'none', label: t('opt.none') },
          ]}
          error={firstError(errors, 'terrain.mountains')}
          onChange={(v) => update((d) => setOption(d, 'terrain', 'mountains', v as typeof mountains))}
        />
        <NumberInput
          label={t('terrain.size')}
          hint={t('hint.terrain.size')}
          field="terrain.size"
          value={size}
          error={firstError(errors, 'terrain.size')}
          onChange={(v) => update((d) => setNumber(d, 'terrain.size', v))}
        />
      </div>
    </Section>
  );
}
