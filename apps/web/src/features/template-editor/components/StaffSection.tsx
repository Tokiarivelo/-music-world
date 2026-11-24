'use client';

import { useT } from '@/i18n';
import type { SectionProps } from '../interfaces/section.types';
import { setNumber, setOption } from '../lib/editor-model';
import { firstError } from '../lib/editor-validate';
import { NumberInput } from './fields/NumberInput';
import { Section } from './fields/Section';
import { SelectInput } from './fields/SelectInput';

export function StaffSection({ draft, errors, update }: SectionProps) {
  const t = useT('editor');
  const { style, path, clef, glow, lookahead, fallDuration } = draft.staff;
  return (
    <Section title={t('section.staff')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectInput
          label={t('staff.style')}
          value={style}
          options={[
            { value: 'glowing_lines', label: t('opt.glowing_lines') },
            { value: 'aurora', label: t('opt.aurora') },
          ]}
          error={firstError(errors, 'staff.style')}
          onChange={(v) => update((d) => setOption(d, 'staff', 'style', v as typeof style))}
        />
        <SelectInput
          label={t('staff.path')}
          value={path}
          options={[
            { value: 'diagonal_curve', label: t('opt.diagonal_curve') },
            { value: 'straight', label: t('opt.straight') },
          ]}
          error={firstError(errors, 'staff.path')}
          onChange={(v) => update((d) => setOption(d, 'staff', 'path', v as typeof path))}
        />
        <SelectInput
          label={t('staff.clef')}
          value={clef}
          options={[
            { value: 'treble', label: t('opt.treble') },
            { value: 'none', label: t('opt.none') },
          ]}
          error={firstError(errors, 'staff.clef')}
          onChange={(v) => update((d) => setOption(d, 'staff', 'clef', v as typeof clef))}
        />
        <NumberInput
          label={t('staff.glow')}
          field="staff.glow"
          value={glow}
          error={firstError(errors, 'staff.glow')}
          onChange={(v) => update((d) => setNumber(d, 'staff.glow', v))}
        />
        <NumberInput
          label={t('staff.lookahead')}
          field="staff.lookahead"
          value={lookahead}
          error={firstError(errors, 'staff.lookahead')}
          onChange={(v) => update((d) => setNumber(d, 'staff.lookahead', v))}
        />
        <NumberInput
          label={t('staff.fallDuration')}
          field="staff.fallDuration"
          value={fallDuration}
          error={firstError(errors, 'staff.fallDuration')}
          onChange={(v) => update((d) => setNumber(d, 'staff.fallDuration', v))}
        />
      </div>
    </Section>
  );
}
