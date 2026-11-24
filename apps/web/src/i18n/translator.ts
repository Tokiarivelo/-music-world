import { CATALOGS, type MessageKey, type Namespace } from './catalogs';
import { DEFAULT_LOCALE, type Locale } from './config';
import { formatMessage, type MessageParams } from './format';

export interface Translator<N extends Namespace> {
  (key: MessageKey<N>, params?: MessageParams): string;
  readonly locale: Locale;
  /** Text of an API error code: `errors.<CODE>`, else `errors.UNKNOWN`, else the code. */
  error(code: string | null | undefined): string;
}

function lookup(locale: Locale, namespace: Namespace, key: string): string | undefined {
  const table = CATALOGS[locale][namespace] as Record<string, string>;
  return table[key] ?? (CATALOGS[DEFAULT_LOCALE][namespace] as Record<string, string>)[key];
}

/** Pure translator shared by the server (`getT`) and the client (`useT`). A missing translation falls back to `en`. */
export function createTranslator<N extends Namespace>(locale: Locale, namespace: N): Translator<N> {
  const t = ((key: MessageKey<N>, params?: MessageParams) => {
    const message = lookup(locale, namespace, key);
    return message === undefined ? key : formatMessage(message, params, locale);
  }) as Translator<N>;
  const error = (code: string | null | undefined): string => {
    const message = lookup(locale, namespace, `errors.${code ?? 'UNKNOWN'}`) ?? lookup(locale, namespace, 'errors.UNKNOWN');
    return message === undefined ? String(code ?? 'UNKNOWN') : formatMessage(message, {}, locale);
  };
  return Object.assign(t, { locale, error });
}
