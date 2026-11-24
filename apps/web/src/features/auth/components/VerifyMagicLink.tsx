'use client';

import Link from 'next/link';
import { useT } from '@/i18n';
import type { Session } from '@/templates/generated';
import { verifyMagicLink } from '../api/auth.api';
import { AUTH_ROUTES } from '../consts/auth.consts';
import { useVerifyMagicLink } from '../hooks/use-verify-magic-link';

interface VerifyMagicLinkProps {
  token: string | null;
  /** Injected in tests; defaults to `POST /api/auth/verify`. */
  verify?: (token: string) => Promise<Session>;
}

/** `/auth/verify?token=…`: signs the user in, then offers the gallery (or a new link on failure). */
export function VerifyMagicLink({ token, verify = verifyMagicLink }: VerifyMagicLinkProps) {
  const t = useT('auth');
  const { status, errorKey } = useVerifyMagicLink(token, verify);
  return (
    <section className="flex max-w-sm flex-col items-center gap-4 text-center">
      {status === 'verifying' && <p role="status">{t('verifying')}</p>}
      {status === 'verified' && (
        <>
          <p role="status">{t('verified')}</p>
          <Link className="rounded-full bg-[var(--mw-secondary)] px-6 py-2 font-medium" href={AUTH_ROUTES.afterSignIn}>
            {t('continue')}
          </Link>
        </>
      )}
      {(status === 'error' || status === 'missing') && (
        <>
          <p role="alert" className="text-[var(--mw-accent)]">
            {status === 'missing' ? t('missingToken') : t.error(errorKey)}
          </p>
          <Link className="underline" href={AUTH_ROUTES.signIn}>
            {t('newLink')}
          </Link>
        </>
      )}
    </section>
  );
}
