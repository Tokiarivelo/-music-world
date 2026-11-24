import { describe, expect, it } from 'vitest';
import { CATALOGS, type Namespace } from './catalogs';
import { DEFAULT_LOCALE, LOCALES } from './config';
import { formatMessage, messageParams } from './format';
import { localeFromAcceptLanguage, resolveLocale } from './resolve-locale';
import { createTranslator } from './translator';

const NAMESPACES = Object.keys(CATALOGS[DEFAULT_LOCALE]) as Namespace[];
const table = (locale: (typeof LOCALES)[number], ns: Namespace) => CATALOGS[locale][ns] as Record<string, string>;

describe('formatMessage', () => {
  it('substitutes parameters and formats numbers by locale', () => {
    expect(formatMessage('Hello {name}', { name: 'Ana' })).toBe('Hello Ana');
    expect(formatMessage('{n} items', { n: 1234.5 }, 'en')).toBe('1,234.5 items');
    expect(formatMessage('{n} items', { n: 1234.5 }, 'fr')).toBe('1 234,5 items');
  });

  it('selects plural branches, with exact matches first and # as the count', () => {
    const msg = '{count, plural, =0 {no note} one {# note} other {# notes}}';
    expect(formatMessage(msg, { count: 0 })).toBe('no note');
    expect(formatMessage(msg, { count: 1 })).toBe('1 note');
    expect(formatMessage(msg, { count: 1500 })).toBe('1,500 notes');
    expect(formatMessage(msg, { count: 0 }, 'fr')).toBe('no note');
  });

  it('uses the locale plural rules (French: 0 is singular)', () => {
    const msg = '{count, plural, one {# note} other {# notes}}';
    expect(formatMessage(msg, { count: 0 }, 'fr')).toBe('0 note');
    expect(formatMessage(msg, { count: 0 }, 'en')).toBe('0 notes');
  });

  it('supports select and keeps a missing parameter visible', () => {
    expect(formatMessage('{g, select, f {She} other {They}}', { g: 'f' })).toBe('She');
    expect(formatMessage('{g, select, f {She} other {They}}', { g: 'x' })).toBe('They');
    expect(formatMessage('Hi {name}', {})).toBe('Hi {name}');
  });

  it('returns a malformed message unchanged instead of throwing', () => {
    expect(formatMessage('{broken', {})).toBe('{broken');
    expect(formatMessage('{n, date}', { n: 1 })).toBe('{n, date}');
  });

  it('lists the parameters of a message', () => {
    expect(messageParams('{b} {a, plural, one {# x {c}} other {#}}')).toEqual(['a', 'b', 'c']);
  });
});

describe('resolveLocale', () => {
  it('prefers the cookie, then Accept-Language, then en', () => {
    expect(resolveLocale('mg', 'fr')).toBe('mg');
    expect(resolveLocale(undefined, 'fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(resolveLocale('xx', 'de,mg;q=0.5')).toBe('mg');
    expect(resolveLocale(null, 'de-DE')).toBe('en');
    expect(resolveLocale(null, null)).toBe('en');
  });

  it('honours quality values and ignores q=0', () => {
    expect(localeFromAcceptLanguage('en;q=0.3, fr;q=0.8')).toBe('fr');
    expect(localeFromAcceptLanguage('fr;q=0, mg')).toBe('mg');
  });
});

describe('translator', () => {
  it('translates, falls back to en and maps API error codes', () => {
    const fr = createTranslator('fr', 'upload');
    expect(fr('submit')).toBe('Analyser');
    expect(fr.error('AUDIO_TOO_LONG')).toContain('30 minutes');
    expect(fr.error('NOT_A_CODE')).toBe(fr.error('UNKNOWN'));
    expect(fr.error(null)).toBe(fr.error('UNKNOWN'));
  });
});

describe('catalogs', () => {
  it.each(NAMESPACES)('%s: every locale has the same keys and parameters as en', (ns) => {
    const source = table(DEFAULT_LOCALE, ns);
    for (const locale of LOCALES) {
      const other = table(locale, ns);
      expect(Object.keys(other).sort(), `${locale}/${ns} keys`).toEqual(Object.keys(source).sort());
      for (const [key, message] of Object.entries(source)) {
        expect(messageParams(other[key]!), `${locale}/${ns}.${key} params`).toEqual(messageParams(message));
        expect(other[key]!.trim(), `${locale}/${ns}.${key} empty`).not.toBe('');
      }
    }
  });

  it('every message parses (no malformed ICU)', () => {
    for (const locale of LOCALES) for (const ns of NAMESPACES) for (const m of Object.values(table(locale, ns))) messageParams(m);
  });

  it('every API error namespace has an UNKNOWN fallback', () => {
    for (const ns of NAMESPACES) {
      const hasErrors = Object.keys(table('en', ns)).some((k) => k.startsWith('errors.'));
      if (hasErrors) expect(table('en', ns)['errors.UNKNOWN']).toBeTruthy();
    }
  });
});
