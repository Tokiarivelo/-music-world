import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, useLocale, useT } from './provider';

/** Stand-in for the language select (the real one needs the Next router). */
function LanguageSwitchForTest() {
  const { setLocale } = useLocale();
  return (
    <button onClick={() => setLocale('mg')} type="button">
      mg
    </button>
  );
}

function Probe() {
  const t = useT('player');
  const { locale } = useLocale();
  return (
    <p data-testid="probe">
      {locale}:{t('play')}:{t('demoStats', { key: 'C', bpm: 120, count: 1 })}
    </p>
  );
}

afterEach(() => {
  cleanup();
  document.cookie = 'mw_locale=; max-age=0; path=/';
  document.documentElement.lang = '';
});

describe('I18nProvider', () => {
  it('renders in the given locale and falls back to en by default', () => {
    const { unmount } = render(
      <I18nProvider locale="fr">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('fr:Lecture:C · 120 BPM · 1 note');
    unmount();
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('en:Play:C · 120 BPM · 1 note');
  });

  it('switches language without remounting, stores the cookie and updates <html lang>', () => {
    render(
      <I18nProvider locale="en">
        <Probe />
        <LanguageSwitchForTest />
      </I18nProvider>,
    );
    const before = screen.getByTestId('probe');
    act(() => screen.getByRole('button', { name: 'mg' }).click());
    expect(screen.getByTestId('probe')).toBe(before); // same DOM node: nothing was remounted
    expect(before.textContent).toBe('mg:Alefaso:C · 120 BPM · nota 1');
    expect(document.cookie).toContain('mw_locale=mg');
    expect(document.documentElement.lang).toBe('mg');
  });
});
