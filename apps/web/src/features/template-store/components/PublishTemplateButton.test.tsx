import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { PublishApi } from '../hooks/use-publish-template';
import { stored } from '../test-fixtures';
import { PublishTemplateButton } from './PublishTemplateButton';

afterEach(cleanup);

const API: PublishApi = {
  create: vi.fn(async () => stored()),
  uploadThumbnail: vi.fn(async () => stored()),
  renderThumbnail: vi.fn(async () => null),
};

describe('PublishTemplateButton', () => {
  it('asks signed-out users to sign in', () => {
    render(<PublishTemplateButton template={NEON_NOCTURNE} signedIn={false} api={API} />);
    expect(screen.getByRole('link', { name: 'Sign in to publish' }).getAttribute('href')).toBe('/sign-in');
  });

  it('publishes once and links to the store', async () => {
    render(<PublishTemplateButton template={NEON_NOCTURNE} signedIn api={API} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish to the store' }));
    expect((await screen.findByRole('status')).textContent).toContain('Published in the store');
    expect(screen.queryByRole('button')).toBeNull();
    expect(API.uploadThumbnail).not.toHaveBeenCalled(); // no canvas: no thumbnail, still published
  });
});
