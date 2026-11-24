import Link from 'next/link';
import { AccountMenu } from '@/features/auth';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="absolute right-4 top-4">
        <AccountMenu />
      </div>
      <h1 className="text-4xl font-semibold text-[var(--mw-primary)]">Music World</h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link className="rounded-full bg-[var(--mw-secondary)] px-6 py-3 font-medium" href="/play/demo">
          Open the demo world
        </Link>
        <Link className="rounded-full border border-[var(--mw-primary)] px-6 py-3 font-medium" href="/upload">
          Upload your song
        </Link>
        <Link className="rounded-full border border-[var(--mw-accent)] px-6 py-3 font-medium" href="/templates">
          Browse templates
        </Link>
      </div>
    </main>
  );
}
