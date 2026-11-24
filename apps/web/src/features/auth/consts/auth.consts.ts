export const AUTH_TEXT = {
  title: 'Sign in to Music World',
  intro: 'Enter your e-mail address: we send you a sign-in link (no password).',
  email: 'E-mail address',
  send: 'Send me a sign-in link',
  sending: 'Sending…',
  sent: (email: string): string => `Check ${email}: the link works once and expires in 15 minutes.`,
  verifying: 'Signing you in…',
  verified: 'You are signed in.',
  missingToken: 'This sign-in link is incomplete. Ask for a new one.',
  newLink: 'Ask for a new link',
  continue: 'Browse templates',
  signIn: 'Sign in',
  signOut: 'Sign out',
  signedInAs: (name: string): string => `Signed in as ${name}`,
} as const;

export const AUTH_ROUTES = { signIn: '/sign-in', afterSignIn: '/templates' } as const;

/** Message keys (API error codes) → user-facing text. */
export const AUTH_ERRORS: Record<string, string> = {
  EMAIL_INVALID: 'Enter a valid e-mail address.',
  REQUEST_INVALID: 'Enter a valid e-mail address.',
  RATE_LIMITED: 'Too many attempts. Try again later.',
  EMAIL_UNAVAILABLE: 'The e-mail could not be sent. Try again later.',
  AUTH_TOKEN_INVALID: 'This sign-in link is invalid or has expired.',
  NETWORK: 'The server could not be reached. Try again.',
  UNKNOWN: 'Something went wrong. Try again.',
};

export function authErrorText(code: string | null): string {
  return AUTH_ERRORS[code ?? 'UNKNOWN'] ?? AUTH_ERRORS.UNKNOWN!;
}
