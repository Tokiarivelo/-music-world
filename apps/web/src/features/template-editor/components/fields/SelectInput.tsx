'use client';

import { useId } from 'react';
import { CONTROL } from '../../consts/ui.consts';
import type { EditorError } from '../../lib/editor-validate';
import { FieldError } from './FieldError';

export interface Option {
  value: string;
  label: string;
}

interface SelectInputProps {
  label: string;
  value: string;
  options: readonly Option[];
  error?: EditorError;
  onChange(value: string): void;
}

export function SelectInput({ label, value, options, error, onChange }: SelectInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <select
        id={id}
        className={CONTROL}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}
