'use client';

import Link from 'next/link';
import { AUTH_ROUTES, AUTH_TEXT } from '../consts/auth.consts';
import type { SessionState } from '../hooks/use-session';

interface AccountBadgeProps {
  session: SessionState;
}

/** "Sign in" link, or the public author name and a "Sign out" button. */
export function AccountBadge({ session }: AccountBadgeProps) {
  if (session.status === 'loading') return null;
  if (session.user === null) {
    return (
      <Link className="rounded-full border border-white/30 px-3 py-1 text-sm" href={AUTH_ROUTES.signIn}>
        {AUTH_TEXT.signIn}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="opacity-80">{AUTH_TEXT.signedInAs(session.user.displayName)}</span>
      <button type="button" className="rounded-full border border-white/30 px-3 py-1" onClick={session.signOut}>
        {AUTH_TEXT.signOut}
      </button>
    </div>
  );
}
