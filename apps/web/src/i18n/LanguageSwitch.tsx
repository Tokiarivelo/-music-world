'use client';

import { useRouter } from 'next/navigation';
import { isLocale, LOCALES, LOCALE_NAMES } from './config';
import { useLocale, useT } from './provider';

/** Language select (keyboard accessible); options are named in their own language. */
export function LanguageSwitch() {
  const t = useT('common');
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  return (
    <select
      aria-label={t('language')}
      className="rounded-full border border-white/30 bg-[var(--mw-bg)]/80 px-3 py-1 text-sm"
      onChange={(e) => {
        const next = e.target.value;
        if (!isLocale(next)) return;
        setLocale(next);
        router.refresh(); // re-renders the server parts (title, home) without remounting the client tree
      }}
      value={locale}
    >
      {LOCALES.map((code) => (
        <option key={code} lang={code} value={code}>
          {LOCALE_NAMES[code]}
        </option>
      ))}
    </select>
  );
}
