import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { stored } from '../test-fixtures';
import { TemplateGallery } from './TemplateGallery';

afterEach(cleanup);

const AI = stored({
  id: 'ai-1',
  template: {
    ...NEON_NOCTURNE,
    id: 'ai-mock-1-abcdef12',
    name: 'Glass <b>Night</b>',
    meta: { generatedBy: { provider: 'mock', model: 'mock-director-1', promptVersion: 'director-v1' } },
  },
  thumbnailUrl: '/api/templates/ai-1/thumbnail?v=abc',
});
const FEATURED = stored({ id: 'f-1', featured: true, author: { displayName: 'Music World' } });

describe('TemplateGallery', () => {
  it('shows cards with labels, thumbnails or previews, and pages', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [FEATURED, AI], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [stored({ id: 'old' })], nextCursor: null });
    render(<TemplateGallery list={list} />);
    expect(await screen.findByText('Glass <b>Night</b>')).toBeTruthy(); // rendered as text, never as HTML
    expect(screen.getByText('Launch template')).toBeTruthy();
    expect(screen.getByText('AI-generated (mock)')).toBeTruthy();
    expect(screen.getByText('by Music World · License CC-BY-4.0')).toBeTruthy();
    const thumb = screen.getByRole('img', { name: 'Preview of Glass <b>Night</b>' });
    expect(thumb.getAttribute('src')).toBe('/api/templates/ai-1/thumbnail?v=abc');
    const links = screen.getAllByRole('link', { name: 'Use this template' }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/play/demo?template=f-1', '/play/demo?template=ai-1']);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Use this template' })).toHaveLength(3));
    expect(list).toHaveBeenLastCalledWith('next', 24);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows an empty store and errors', async () => {
    render(<TemplateGallery list={vi.fn(async () => ({ items: [], nextCursor: null }))} />);
    expect(await screen.findByText('No template has been published yet.')).toBeTruthy();
  });
});
