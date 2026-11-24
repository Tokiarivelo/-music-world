/** Supported locales. Adding one = a folder in `messages/` + one line here + one line in `catalogs.ts`. */
export const LOCALES = ['en', 'fr', 'mg'] as const;
export type Locale = (typeof LOCALES)[number];

/** Source language: every key exists in it, and it is the run-time fallback. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language is named in itself (never translated), so it can be found whatever the current language is. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', mg: 'Malagasy' };

/** Writing direction per locale (all current ones are left to right). */
export const LOCALE_DIR: Record<Locale, 'ltr' | 'rtl'> = { en: 'ltr', fr: 'ltr', mg: 'ltr' };

export const LOCALE_COOKIE = 'mw_locale';
export const LOCALE_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
