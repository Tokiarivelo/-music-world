import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-semibold text-[var(--mw-primary)]">Music World</h1>
      <Link className="rounded-full bg-[var(--mw-secondary)] px-6 py-3 font-medium" href="/play/demo">
        Open the demo world
      </Link>
    </main>
  );
}
