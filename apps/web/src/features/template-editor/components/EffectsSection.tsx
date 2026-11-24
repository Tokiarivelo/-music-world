'use client';

import { useT } from '@/i18n';
import type { SectionProps } from '../interfaces/section.types';
import { setNumber, setOption } from '../lib/editor-model';
import { firstError } from '../lib/editor-validate';
import { NumberInput } from './fields/NumberInput';
import { Section } from './fields/Section';
import { SelectInput } from './fields/SelectInput';
import { ToggleInput } from './fields/ToggleInput';

export function EffectsSection({ draft, errors, update }: SectionProps) {
  const t = useT('editor');
  const { particles, bloom, beatPulse, chordLinks } = draft.fx;
  return (
    <Section title={t('section.effects')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectInput
          label={t('fx.particles')}
          value={particles}
          options={[
            { value: 'arcs', label: t('opt.arcs') },
            { value: 'dust', label: t('opt.dust') },
            { value: 'none', label: t('opt.none') },
          ]}
          error={firstError(errors, 'fx.particles')}
          onChange={(v) => update((d) => setOption(d, 'fx', 'particles', v as typeof particles))}
        />
        <SelectInput
          label={t('fx.chordLinks')}
          value={chordLinks}
          options={[
            { value: 'light_arc', label: t('opt.light_arc') },
            { value: 'none', label: t('opt.none') },
          ]}
          error={firstError(errors, 'fx.chordLinks')}
          onChange={(v) => update((d) => setOption(d, 'fx', 'chordLinks', v as typeof chordLinks))}
        />
        <NumberInput
          label={t('fx.bloom')}
          field="fx.bloom"
          value={bloom}
          error={firstError(errors, 'fx.bloom')}
          onChange={(v) => update((d) => setNumber(d, 'fx.bloom', v))}
        />
        <ToggleInput label={t('fx.beatPulse')} checked={beatPulse} onChange={(v) => update((d) => setOption(d, 'fx', 'beatPulse', v))} />
      </div>
    </Section>
  );
}
