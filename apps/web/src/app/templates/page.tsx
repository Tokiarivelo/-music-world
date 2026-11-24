import Link from 'next/link';
import { AccountMenu } from '@/features/auth';
import { TemplateGallery } from '@/features/template-store';

export default function TemplatesPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <nav className="flex items-center justify-between">
        <Link href="/" className="font-semibold">
          Music World
        </Link>
        <AccountMenu />
      </nav>
      <TemplateGallery />
    </main>
  );
}
