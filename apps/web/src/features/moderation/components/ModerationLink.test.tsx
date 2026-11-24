import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionApi } from '@/features/auth';
import { ModerationLink } from './ModerationLink';

afterEach(cleanup);

const USER = { id: 'u', email: 'a@b.co', displayName: 'creator-1' };
const api = (session: Awaited<ReturnType<SessionApi['getSession']>>): SessionApi => ({
  getSession: async () => session,
  signOut: async () => undefined,
});

describe('ModerationLink', () => {
  it('links to the queue for a moderator', async () => {
    render(<ul><ModerationLink api={api({ user: USER, moderator: true })} /></ul>);
    expect((await screen.findByRole('link', { name: 'Moderation' })).getAttribute('href')).toBe('/moderation');
  });

  it('renders nothing for other users and for signed-out visitors', async () => {
    const { container } = render(<ul><ModerationLink api={api({ user: USER, moderator: null })} /></ul>);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector('li')).toBeNull();
    cleanup();
    const out = render(<ul><ModerationLink api={api({ user: null, moderator: null })} /></ul>);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(out.container.querySelector('li')).toBeNull();
  });
});
