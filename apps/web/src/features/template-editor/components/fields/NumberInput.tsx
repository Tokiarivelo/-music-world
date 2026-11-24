'use client';

import { useId } from 'react';
import { NUMBER_BOUNDS, type NumberField } from '../../consts/template-editor.consts';
import { CONTROL } from '../../consts/ui.consts';
import type { EditorError } from '../../lib/editor-validate';
import { FieldError } from './FieldError';

interface NumberInputProps {
  label: string;
  field: NumberField;
  value: number;
  error?: EditorError;
  onChange(value: number): void;
}

/** Number control whose min / max / step come from the schema bounds. */
export function NumberInput({ label, field, value, error, onChange }: NumberInputProps) {
  const id = useId();
  const { min, max, step } = NUMBER_BOUNDS[field];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="number"
        className={CONTROL}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          if (e.target.value !== '') onChange(e.target.valueAsNumber);
        }}
      />
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}
