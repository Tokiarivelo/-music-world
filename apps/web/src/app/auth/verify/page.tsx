import { VerifyMagicLink } from '@/features/auth';

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center p-4 sm:p-6">
      <VerifyMagicLink token={typeof token === 'string' ? token : null} />
    </main>
  );
}
