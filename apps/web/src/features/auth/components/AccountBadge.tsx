'use client';

import Link from 'next/link';
import { useT } from '@/i18n';
import { AUTH_ROUTES } from '../consts/auth.consts';
import type { SessionState } from '../hooks/use-session';

interface AccountBadgeProps {
  session: SessionState;
}

/** "Sign in" link, or the public author name and a "Sign out" button. */
export function AccountBadge({ session }: AccountBadgeProps) {
  const t = useT('auth');
  if (session.status === 'loading') return null;
  if (session.user === null) {
    return (
      <Link className="rounded-full border border-white/30 px-3 py-1 text-sm" href={AUTH_ROUTES.signIn}>
        {t('signIn')}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="opacity-80">{t('signedInAs', { name: session.user.displayName })}</span>
      <button type="button" className="rounded-full border border-white/30 px-3 py-1" onClick={session.signOut}>
        {t('signOut')}
      </button>
    </div>
  );
}
