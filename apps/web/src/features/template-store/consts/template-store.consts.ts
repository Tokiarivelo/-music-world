export const STORE_TEXT = {
  galleryTitle: 'Template store',
  galleryIntro: 'Worlds published by the community. Pick one to build your song’s world with it.',
  by: (author: string): string => `by ${author}`,
  featured: 'Launch template',
  aiLabel: (provider: string): string => `AI-generated (${provider})`,
  use: 'Use this template',
  more: 'Load more',
  loading: 'Loading templates…',
  empty: 'No template has been published yet.',
  publish: 'Publish to the store',
  publishing: 'Publishing…',
  published: 'Published in the store',
  viewStore: 'Open the store',
  signInToPublish: 'Sign in to publish',
  license: (license: string): string => `License ${license}`,
  previewAlt: (name: string): string => `Preview of ${name}`,
} as const;

export const REPORT_REASONS = ['offensive', 'spam', 'broken', 'copyright'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_TEXT = {
  open: 'Report',
  reason: 'Reason',
  send: 'Send report',
  sent: 'Thanks, the report was sent.',
  reasons: { offensive: 'Offensive', spam: 'Spam', broken: 'Does not render', copyright: 'Copyright' },
} as const satisfies { reasons: Record<ReportReason, string> } & Record<string, unknown>;

export const STORE_ROUTES = {
  gallery: '/templates',
  signIn: '/sign-in',
  play: (storeId: string): string => `/play/demo?template=${encodeURIComponent(storeId)}`,
} as const;

/** Newest store templates offered by the player's template picker (2D and VR). */
export const PLAYER_STORE_LIMIT = 12;
export const GALLERY_PAGE_SIZE = 24;
export const THUMBNAIL_SIZE = 256;
export const THUMBNAIL_QUALITY = 0.85;
export const PUBLISH_LICENSE = 'CC-BY-4.0';

export const PROVIDER_NAMES: Record<string, string> = { muse: 'Meta Muse', bedrock: 'Claude', mock: 'mock' };

/** Message keys (API error codes) → user-facing text. */
export const STORE_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: 'Sign in to publish.',
  CSRF_FAILED: 'Your session expired. Sign in again.',
  TEMPLATE_INVALID: 'This template cannot be published (it does not pass the store checks).',
  RATE_LIMITED: 'Too many templates published. Try again later.',
  TEMPLATE_NOT_REPORTABLE: 'This template cannot be reported.',
  TEMPLATE_NOT_FOUND: 'This template is no longer in the store.',
  NETWORK: 'The server could not be reached. Try again.',
  UNKNOWN: 'Something went wrong. Try again.',
};

export function storeErrorText(code: string | null): string {
  return STORE_ERRORS[code ?? 'UNKNOWN'] ?? STORE_ERRORS.UNKNOWN!;
}
