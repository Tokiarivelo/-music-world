export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]';
export const CONTROL = `rounded border border-white/20 bg-[var(--mw-bg)] px-2 py-1 text-sm ${FOCUS}`;
export const BUTTON = `rounded-full border border-white/30 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-40 ${FOCUS}`;
export const HEX_PATTERN = '^#[0-9a-fA-F]{6}$';
/** Requirement 4.1: the preview follows the last valid change within 500 ms. */
export const PREVIEW_DEBOUNCE_MS = 300;
