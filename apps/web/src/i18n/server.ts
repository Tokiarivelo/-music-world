import { cookies, headers } from 'next/headers';
import type { Namespace } from './catalogs';
import type { Locale } from './config';
import { LOCALE_COOKIE } from './config';
import { resolveLocale } from './resolve-locale';
import { createTranslator, type Translator } from './translator';

/** Locale of the current request: cookie > `Accept-Language` > `en`. */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get('accept-language'));
}

/** Translator for server components and `generateMetadata`. */
export async function getT<N extends Namespace>(namespace: N): Promise<Translator<N>> {
  return createTranslator(await getLocale(), namespace);
}
