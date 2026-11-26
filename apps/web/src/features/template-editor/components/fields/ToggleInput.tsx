'use client';

import { useId } from 'react';
import { FOCUS } from '../../consts/ui.consts';
import { Hint } from './Hint';

export function ToggleInput({ label, checked, hint, onChange }: { label: string; checked: boolean; hint?: string; onChange(v: boolean): void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input id={id} type="checkbox" className={FOCUS} checked={checked} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
      </div>
      <Hint id={`${id}-hint`}>{hint}</Hint>
    </div>
  );
}
