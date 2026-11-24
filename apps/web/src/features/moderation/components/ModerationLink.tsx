'use client';

import Link from 'next/link';
import { useSession, type SessionApi } from '@/features/auth';
import { useT } from '@/i18n';
import { MODERATION_ROUTES } from '../consts/moderation.consts';

interface ModerationLinkProps {
  className?: string;
  /** Injected in tests. */
  api?: SessionApi;
}

/** `<li>` with the link to the queue (use inside a list), only for a moderator; nothing for everyone else. */
export function ModerationLink({ className, api }: ModerationLinkProps) {
  const t = useT('moderation');
  const session = useSession(api);
  if (!session.moderator) return null;
  return (
    <li>
      <Link className={className} href={MODERATION_ROUTES.queue}>
        {t('navLink')}
      </Link>
    </li>
  );
}
