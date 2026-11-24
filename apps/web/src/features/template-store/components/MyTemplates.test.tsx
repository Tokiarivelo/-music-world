import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { stored } from '../test-fixtures';
import { MyTemplates } from './MyTemplates';

afterEach(cleanup);

describe('MyTemplates', () => {
  it('labels each status and explains a hidden template', async () => {
    const list = vi.fn(async () => [
      stored({ id: 'a', status: 'draft' }),
      stored({ id: 'b', status: 'published' }),
      stored({ id: 'c', status: 'hidden' }),
    ]);
    render(<MyTemplates list={list} />);
    expect(await screen.findByText('Draft')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getAllByText('Hidden after reports, under review')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Use this template' })).toHaveLength(1);
  });

  it('renders nothing when the user has no template', async () => {
    const { container } = render(<MyTemplates list={async () => []} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector('section')).toBeNull();
  });

  it('shows an alert when the list cannot be loaded', async () => {
    render(<MyTemplates list={async () => Promise.reject(new ApiError('NETWORK', 0))} />);
    expect((await screen.findByRole('alert')).textContent).toContain('could not be reached');
  });
});
