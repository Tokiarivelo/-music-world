'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n';
import { requestMagicLink } from '../api/auth.api';
import { useMagicLink } from '../hooks/use-magic-link';

interface SignInFormProps {
  /** Injected in tests; defaults to `POST /api/auth/magic-link`. */
  request?: (email: string) => Promise<void>;
}

/** E-mail field → "Send me a sign-in link"; the answer never says whether an account exists. */
export function SignInForm({ request = requestMagicLink }: SignInFormProps) {
  const t = useT('auth');
  const [email, setEmail] = useState('');
  const { status, errorKey, sentTo, send } = useMagicLink(request);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(email);
  };
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3" noValidate>
      <h1 className="text-2xl font-semibold text-[var(--mw-primary)]">{t('title')}</h1>
      <p className="text-sm opacity-80">{t('intro')}</p>
      <label htmlFor="sign-in-email" className="text-sm font-medium">
        {t('email')}
      </label>
      <input
        id="sign-in-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="rounded border border-white/20 bg-transparent px-3 py-2"
      />
      <button
        type="submit"
        disabled={status === 'sending' || email.trim() === ''}
        className="rounded-full bg-[var(--mw-primary)] px-4 py-2 font-medium text-black disabled:opacity-50"
      >
        {status === 'sending' ? t('sending') : t('send')}
      </button>
      {status === 'sent' && sentTo && <p role="status">{t('sent', { email: sentTo })}</p>}
      {status === 'error' && (
        <p role="alert" className="text-[var(--mw-accent)]">
          {t.error(errorKey)}
        </p>
      )}
    </form>
  );
}
