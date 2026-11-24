'use client';

import { useId } from 'react';
import { FOCUS } from '../../consts/ui.consts';

export function ToggleInput({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className={FOCUS} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}
