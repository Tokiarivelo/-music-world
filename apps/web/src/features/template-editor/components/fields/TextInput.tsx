'use client';

import { useId } from 'react';
import { CONTROL } from '../../consts/ui.consts';
import type { EditorError } from '../../lib/editor-validate';
import { FieldError } from './FieldError';

interface TextInputProps {
  label: string;
  value: string;
  maxLength?: number;
  hint?: string;
  error?: EditorError;
  onChange(value: string): void;
}

export function TextInput({ label, value, maxLength, hint, error, onChange }: TextInputProps) {
  const id = useId();
  const described = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={CONTROL}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs opacity-70">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}
