import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HANDOFF_KEY, readStashedTemplate } from '@/lib/template-stash';
import { NEON_NOCTURNE } from '@/templates/default';
import { EditCopyLink } from './EditCopyLink';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('EditCopyLink', () => {
  it('opens a built-in template by id, without stashing anything', () => {
    render(<EditCopyLink template={NEON_NOCTURNE} />);
    const link = screen.getByRole('link', { name: 'Edit a copy' });
    expect(link.getAttribute('href')).toBe('/editor?from=neon-nocturne');
    fireEvent.click(link);
    expect(readStashedTemplate(HANDOFF_KEY)).toBeNull();
  });

  it('hands any other template over through sessionStorage', () => {
    const other = { ...NEON_NOCTURNE, id: 'community-night', name: 'Community Night' };
    render(<EditCopyLink template={other} />);
    const link = screen.getByRole('link', { name: 'Edit a copy' });
    expect(link.getAttribute('href')).toBe('/editor?from=session');
    fireEvent.click(link);
    expect(readStashedTemplate(HANDOFF_KEY)).toEqual(other);
  });
});
