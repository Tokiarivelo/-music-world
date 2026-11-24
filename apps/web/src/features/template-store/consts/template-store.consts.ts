export const REPORT_REASONS = ['offensive', 'spam', 'broken', 'copyright'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
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

