import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { LanguageSwitch, I18nProvider } from '@/i18n';
import { LOCALE_DIR } from '@/i18n/config';
import { getLocale, getT } from '@/i18n/server';
import './globals.css';

/** `viewport-fit=cover`: the world draws under the notch and home bar; overlays use the safe-area insets. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('common');
  return { title: t('appName'), description: t('description') };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html dir={LOCALE_DIR[locale]} lang={locale}>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale}>
          {children}
          <div className="fixed left-1/2 top-2 z-30 -translate-x-1/2">
            <LanguageSwitch />
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
