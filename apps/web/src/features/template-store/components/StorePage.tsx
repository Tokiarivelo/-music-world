'use client';

import Link from 'next/link';
import { AccountBadge, useSession } from '@/features/auth';
import { TemplateGallery } from './TemplateGallery';

/** `/templates`: navigation, account and the gallery (signed-in viewers can report templates). */
export function StorePage() {
  const session = useSession();
  return (
    <>
      <nav className="flex items-center justify-between">
        <Link href="/" className="font-semibold">
          Music World
        </Link>
        <AccountBadge session={session} />
      </nav>
      <TemplateGallery signedIn={session.user !== null} />
    </>
  );
}
