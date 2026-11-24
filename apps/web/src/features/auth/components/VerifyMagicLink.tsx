'use client';

import Link from 'next/link';
import type { Session } from '@/templates/generated';
import { verifyMagicLink } from '../api/auth.api';
import { AUTH_ROUTES, AUTH_TEXT, authErrorText } from '../consts/auth.consts';
import { useVerifyMagicLink } from '../hooks/use-verify-magic-link';

interface VerifyMagicLinkProps {
  token: string | null;
  /** Injected in tests; defaults to `POST /api/auth/verify`. */
  verify?: (token: string) => Promise<Session>;
}

/** `/auth/verify?token=…`: signs the user in, then offers the gallery (or a new link on failure). */
export function VerifyMagicLink({ token, verify = verifyMagicLink }: VerifyMagicLinkProps) {
  const { status, errorKey } = useVerifyMagicLink(token, verify);
  return (
    <section className="flex max-w-sm flex-col items-center gap-4 text-center">
      {status === 'verifying' && <p role="status">{AUTH_TEXT.verifying}</p>}
      {status === 'verified' && (
        <>
          <p role="status">{AUTH_TEXT.verified}</p>
          <Link className="rounded-full bg-[var(--mw-secondary)] px-6 py-2 font-medium" href={AUTH_ROUTES.afterSignIn}>
            {AUTH_TEXT.continue}
          </Link>
        </>
      )}
      {(status === 'error' || status === 'missing') && (
        <>
          <p role="alert" className="text-[var(--mw-accent)]">
            {status === 'missing' ? AUTH_TEXT.missingToken : authErrorText(errorKey)}
          </p>
          <Link className="underline" href={AUTH_ROUTES.signIn}>
            {AUTH_TEXT.newLink}
          </Link>
        </>
      )}
    </section>
  );
}
