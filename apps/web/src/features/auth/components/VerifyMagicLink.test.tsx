import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { VerifyMagicLink } from './VerifyMagicLink';

afterEach(cleanup);

describe('VerifyMagicLink', () => {
  it('posts the token once, even in strict mode, and removes it from the URL', async () => {
    window.history.replaceState(null, '', '/auth/verify?token=abc');
    const verify = vi.fn(async () => ({ user: { id: 'u', email: 'a@b.co', displayName: 'creator-1' }, moderator: null }));
    render(
      <StrictMode>
        <VerifyMagicLink token="abc" verify={verify} />
      </StrictMode>,
    );
    expect(await screen.findByText('You are signed in.')).toBeTruthy();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it('explains an invalid or missing link', async () => {
    render(
      <VerifyMagicLink
        token="bad"
        verify={vi.fn(async () => Promise.reject(new ApiError('AUTH_TOKEN_INVALID', 401)))}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('invalid or has expired');
    cleanup();
    render(<VerifyMagicLink token={null} verify={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('incomplete');
  });
});
