import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { SignInForm } from './SignInForm';

afterEach(cleanup);

function submit(email: string) {
  fireEvent.change(screen.getByLabelText('E-mail address'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }));
}

describe('SignInForm', () => {
  it('sends the link and tells the user to check the inbox', async () => {
    const request = vi.fn(async () => undefined);
    render(<SignInForm request={request} />);
    submit('  ada@example.com ');
    expect((await screen.findByRole('status')).textContent).toContain('Check ada@example.com');
    expect(request).toHaveBeenCalledWith('ada@example.com');
  });

  it('shows the error text of the API code', async () => {
    render(<SignInForm request={vi.fn(async () => Promise.reject(new ApiError('RATE_LIMITED', 429)))} />);
    submit('ada@example.com');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Too many attempts'));
  });
});
