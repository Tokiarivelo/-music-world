'use client';

import { useId, useState } from 'react';
import { CONTROL, FOCUS, HEX_PATTERN } from '../../consts/ui.consts';
import type { EditorError } from '../../lib/editor-validate';
import { FieldError } from './FieldError';

interface ColorInputProps {
  label: string;
  hexLabel: string;
  value: string;
  error?: EditorError;
  onChange(hex: string): void;
}

const HEX = new RegExp(HEX_PATTERN);

/** Color picker plus a `#rrggbb` text box; the text is committed only when it is a complete valid color. */
export function ColorInput({ label, hexLabel, value, error, onChange }: ColorInputProps) {
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          className={`h-8 w-10 rounded border border-white/20 bg-transparent ${FOCUS}`}
          value={HEX.test(value) ? value.toLowerCase() : '#000000'}
          onChange={(e) => {
            setTyped(null);
            onChange(e.target.value);
          }}
        />
        <input
          type="text"
          aria-label={hexLabel}
          className={`${CONTROL} w-28 font-mono`}
          value={typed ?? value}
          maxLength={7}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            const text = e.target.value;
            setTyped(text);
            if (HEX.test(text)) {
              setTyped(null);
              onChange(text.toLowerCase());
            }
          }}
          onBlur={() => setTyped(null)}
        />
      </div>
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}
