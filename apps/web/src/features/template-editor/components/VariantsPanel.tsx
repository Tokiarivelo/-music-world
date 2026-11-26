'use client';

import { useT } from '@/i18n';
import { BUTTON } from '../consts/ui.consts';
import { addVariant, MAX_VARIANTS, patchVariant, removeVariant } from '../lib/node-model';
import type { SectionProps } from '../interfaces/section.types';
import { BoundedNumber } from './fields/BoundedNumber';
import { Section } from './fields/Section';
import { TextInput } from './fields/TextInput';

export interface VariantsPanelProps extends Pick<SectionProps, 'draft' | 'update'> {
  index: number;
}

/** Looks of a recipe (a placed object picks one by index): height factor and colour jitter range. */
export function VariantsPanel({ draft, update, index }: VariantsPanelProps) {
  const t = useT('editor');
  const variants = draft.recipes[index]?.variants ?? [];
  return (
    <Section title={t('variants.title')}>
      <p className="text-sm opacity-80">{t('variants.hint')}</p>
      {variants.map((v, i) => (
        <div key={i} className="flex flex-col gap-2 rounded border border-white/10 p-2">
          <TextInput label={`${i + 1}. ${t('variants.name')}`} value={v.name} maxLength={40} onChange={(name) => update((d) => patchVariant(d, index, i, { name }))} />
          <BoundedNumber label={t('variants.height')} value={v.height ?? 1} min={0.5} max={1.5} step={0.05} hint={t('variants.heightHint')} onChange={(height) => update((d) => patchVariant(d, index, i, { height }))} />
          <BoundedNumber label={t('variants.jitter')} value={v.jitter ?? 0} min={0} max={0.5} step={0.05} hint={t('variants.jitterHint')} onChange={(jitter) => update((d) => patchVariant(d, index, i, { jitter }))} />
          <button type="button" className={`${BUTTON} self-start`} onClick={() => update((d) => removeVariant(d, index, i))}>
            {t('variants.remove')}
          </button>
        </div>
      ))}
      <button type="button" className={`${BUTTON} self-start`} disabled={variants.length >= MAX_VARIANTS} onClick={() => update((d) => addVariant(d, index))}>
        {t('variants.add')}
      </button>
    </Section>
  );
}
