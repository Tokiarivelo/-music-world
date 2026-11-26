/**
 * The one "glass" look of every floating surface (panels, popovers, dialogs, pills): translucent `--mw-bg`, the world
 * behind it blurred and slightly saturated, like an iOS sheet. Add padding and text size where it is used.
 */
const SURFACE = 'border border-white/20 bg-[color-mix(in_srgb,var(--mw-bg)_38%,transparent)] backdrop-blur-2xl backdrop-saturate-150';

/** A floating panel, popover or dialog. */
export const GLASS_PANEL = `rounded-3xl ${SURFACE} shadow-2xl`;
/** A pill (toggle button, nav, language switch) that floats over the world. */
export const GLASS_PILL = `rounded-full ${SURFACE}`;
