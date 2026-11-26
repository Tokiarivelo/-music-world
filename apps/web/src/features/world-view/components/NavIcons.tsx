import type { ReactElement } from "react";

interface IconProps {
  className?: string;
}

const base = {
  "aria-hidden": true,
  fill: "none",
  height: 16,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
  viewBox: "0 0 24 24",
  width: 16,
} as const;

/** Street-View style little person (also used as the draggable pegman). */
export function PegmanIcon({ className }: IconProps): ReactElement {
  return (
    <svg {...base} className={className} fill="currentColor" stroke="none">
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M9 8h6a1.5 1.5 0 0 1 1.5 1.5V14H15v8h-2.2v-5.5h-1.6V22H9v-8H7.5V9.5A1.5 1.5 0 0 1 9 8Z" />
    </svg>
  );
}

export function ExploreIcon({ className }: IconProps): ReactElement {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}

export function ResetIcon({ className }: IconProps): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function ViewIcon({ className }: IconProps): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
