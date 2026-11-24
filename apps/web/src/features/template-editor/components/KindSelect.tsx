'use client';

import { useT } from '@/i18n';
import type { Template } from '@/templates/generated';
import { BUILTIN_KINDS } from '../consts/template-editor.consts';
import type { EditorError } from '../lib/editor-validate';
import { SelectInput } from './fields/SelectInput';

interface KindSelectProps {
  label: string;
  value: string;
  recipes: Template['recipes'];
  error?: EditorError;
  onChange(kind: string): void;
}

/** Built-in shape kinds plus the recipes the template already defines (recipes themselves are not editable here). */
export function KindSelect({ label, value, recipes, error, onChange }: KindSelectProps) {
  const t = useT('editor');
  const options = [
    ...BUILTIN_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) })),
    ...recipes.map((r) => ({ value: `recipe:${r.name}`, label: t('kind.recipe', { name: r.name }) })),
  ];
  if (!options.some((o) => o.value === value)) options.push({ value, label: value });
  return <SelectInput label={label} value={value} options={options} error={error} onChange={onChange} />;
}
