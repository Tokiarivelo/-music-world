'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Namespace } from './catalogs';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SEC, LOCALE_DIR, type Locale } from './config';
import { createTranslator, type Translator } from './translator';

interface I18nContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18nContextValue>({ locale: DEFAULT_LOCALE, setLocale: () => undefined });

/**
 * Holds the current locale. Switching never remounts the tree: the world and the audio keep running; only the
 * text re-renders (I3 requirement 4). The catalogs are bundled (a few KB per language).
 */
export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SEC}; samesite=lax`;
      document.documentElement.lang = next;
      document.documentElement.dir = LOCALE_DIR[next];
    } catch {
      // No document (tests, SSR): the state is enough.
    }
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): I18nContextValue {
  return useContext(I18nContext);
}

/** `const t = useT('upload'); t('title'); t('sent', { email })`. */
export function useT<N extends Namespace>(namespace: N): Translator<N> {
  const { locale } = useContext(I18nContext);
  return useMemo(() => createTranslator(locale, namespace), [locale, namespace]);
}
