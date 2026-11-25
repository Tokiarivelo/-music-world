import Link from 'next/link';
import { AccountMenu } from '@/features/auth';
import { getT } from '@/i18n/server';

export default async function HomePage() {
  const t = await getT('common');
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="absolute right-4 top-4">
        <AccountMenu />
      </div>
      <h1 className="text-4xl font-semibold text-[var(--mw-primary)]">{t('appName')}</h1>
      <p className="max-w-xl text-lg opacity-80">{t('description')}</p>
      <Link
        className="rounded-full bg-[var(--mw-secondary)] px-10 py-4 text-lg font-semibold shadow-lg focus-visible:outline focus-visible:outline-2"
        href="/play/demo"
      >
        {t('openDemo')}
      </Link>
      <p className="text-sm opacity-70">{t('demoHint')}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link className="rounded-full border border-[var(--mw-primary)] px-6 py-3 font-medium" href="/upload">
          {t('uploadSong')}
        </Link>
        <Link className="rounded-full border border-[var(--mw-accent)] px-6 py-3 font-medium" href="/templates">
          {t('browseTemplates')}
        </Link>
      </div>
    </main>
  );
}
