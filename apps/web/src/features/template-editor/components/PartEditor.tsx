'use client';

import { useT } from '@/i18n';
import { FIELDS_BY_OP, PART_BOUNDS, PART_OPS, PART_PRIMITIVES, type PartField } from '../consts/recipe.consts';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { removePart, setPartNumber, setPartOp, setPartPrimitive, type Part } from '../lib/recipe-model';
import { BoundedNumber } from './fields/BoundedNumber';
import { SelectInput } from './fields/SelectInput';

interface PartEditorProps extends Pick<SectionProps, 'update'> {
  recipe: number;
  index: number;
  part: Part;
  canRemove: boolean;
}

/** `sides` and `taper` only matter for a prism, or for a stack or cluster that repeats one. */
function visibleFields(part: Part): readonly PartField[] {
  return FIELDS_BY_OP[part.op].filter((f) => (f === 'sides' || f === 'taper' ? (part.op === 'prism' || part.of === 'prism') : true));
}

export function PartEditor({ update, recipe, index, part, canRemove }: PartEditorProps) {
  const t = useT('editor');
  const n = index + 1;
  const repeats = part.op === 'stack' || part.op === 'cluster';
  return (
    <li className="flex flex-col gap-2 rounded border border-white/10 p-2">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-sm font-semibold">{t('part.title', { n })}</h5>
        <button type="button" className={BUTTON} disabled={!canRemove} aria-label={t('part.remove', { n })} onClick={() => update((d) => removePart(d, recipe, index))}>
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SelectInput
          label={`${t('part.title', { n })} · ${t('part.op')}`}
          value={part.op}
          options={PART_OPS.map((o) => ({ value: o, label: t(`part.op.${o}`) }))}
          onChange={(op) => update((d) => setPartOp(d, recipe, index, op as Part['op']))}
        />
        {repeats && (
          <SelectInput
            label={`${t('part.title', { n })} · ${t('part.of')}`}
            value={part.of}
            options={PART_PRIMITIVES.map((o) => ({ value: o, label: t(`part.op.${o}`) }))}
            onChange={(of) => update((d) => setPartPrimitive(d, recipe, index, of as Part['of']))}
          />
        )}
        {visibleFields(part).map((field) => (
          <BoundedNumber
            key={field}
            label={`${t('part.title', { n })} · ${t(`part.${field}`)}`}
            value={part[field]}
            {...PART_BOUNDS[field]}
            onChange={(v) => update((d) => setPartNumber(d, recipe, index, field, v))}
          />
        ))}
      </div>
    </li>
  );
}
