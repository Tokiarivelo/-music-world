import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

/** Best supported locale for an `Accept-Language` header (quality values respected), or `null`. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranked) {
    const primary = tag.split('-')[0];
    const match = LOCALES.find((locale) => locale === tag || locale === primary);
    if (match) return match;
  }
  return null;
}

/** Explicit choice (cookie) > `Accept-Language` > `en` (I3 requirement 3). */
export function resolveLocale(cookieValue: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
