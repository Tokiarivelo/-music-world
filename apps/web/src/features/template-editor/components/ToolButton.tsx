import type { ReactNode } from 'react';
import { FOCUS } from '../consts/ui.consts';
import { WorkspaceIcon, type WorkspaceIconName } from './WorkspaceIcon';

export interface ToolButtonProps {
  icon: WorkspaceIconName;
  label: string;
  /** Key hint appended to the tool tip. */
  keys?: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children?: ReactNode;
}

/** A square icon button with a tool tip (`label (key)`); `active` marks the current tool or an open menu. */
export function ToolButton({ icon, label, keys, active, disabled, onClick, children }: ToolButtonProps) {
  const tip = keys ? `${label} (${keys})` : label;
  return (
    <button
      type="button"
      title={tip}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors disabled:opacity-35 ${FOCUS} ${active ? 'border-[var(--mw-accent)] bg-[var(--mw-accent)]/25' : 'border-transparent hover:bg-white/10'}`}
    >
      <WorkspaceIcon name={icon} />
      {children}
    </button>
  );
}
