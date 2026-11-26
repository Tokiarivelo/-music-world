'use client';

import { useId } from 'react';
import { NUMBER_BOUNDS, type NumberField } from '../../consts/template-editor.consts';
import { CONTROL } from '../../consts/ui.consts';
import type { EditorError } from '../../lib/editor-validate';
import { FieldError } from './FieldError';
import { describedBy, Hint } from './Hint';

interface NumberInputProps {
  label: string;
  field: NumberField;
  value: number;
  hint?: string;
  error?: EditorError;
  onChange(value: number): void;
}

/** Number control whose min / max / step come from the schema bounds. */
export function NumberInput({ label, field, value, hint, error, onChange }: NumberInputProps) {
  const id = useId();
  const { min, max, step } = NUMBER_BOUNDS[field];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {/* Slider for quick coarse changes; the number box next to it gives the exact value. */}
        <input type="range" aria-label={`${label} (slider)`} className="min-w-0 flex-1 accent-[var(--mw-accent)]" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(e.target.valueAsNumber)} />
        <input
          id={id}
          type="number"
          className={`${CONTROL} w-24`}
          min={min}
          max={max}
          step={step}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, 'range', !!error)}
          onChange={(e) => {
            if (e.target.value !== '') onChange(e.target.valueAsNumber);
          }}
        />
      </div>
      <Hint id={`${id}-hint`}>{hint ? `${hint} (${min} – ${max})` : `${min} – ${max}`}</Hint>
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}
