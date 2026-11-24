'use client';

import { useId } from 'react';
import { CONTROL } from '../../consts/ui.consts';
import type { EditorError } from '../../lib/editor-validate';
import { FieldError } from './FieldError';

interface BoundedNumberProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  error?: EditorError;
  onChange(value: number): void;
}

/** Number control with explicit bounds (recipe parts and recipes use `consts/recipe.consts.ts`). */
export function BoundedNumber({ label, value, min, max, step, error, onChange }: BoundedNumberProps) {
  const id = useId();
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
