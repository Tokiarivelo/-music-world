'use client';

import { useSession } from '../hooks/use-session';
import { AccountBadge } from './AccountBadge';

/** Stand-alone account control for pages that do not need the session elsewhere. */
export function AccountMenu() {
  return <AccountBadge session={useSession()} />;
}
