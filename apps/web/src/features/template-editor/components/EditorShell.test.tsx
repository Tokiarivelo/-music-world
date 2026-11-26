import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stashTemplate, UNSAVED_KEY } from '@/lib/template-stash';
import { NEON_NOCTURNE } from '@/templates/default';
import { EditorShell } from './EditorShell';

vi.mock('@/features/player', () => ({ PreviewPlayback: () => null }));
vi.mock('@/features/auth', () => ({
  AUTH_ROUTES: { signIn: '/sign-in', afterSignIn: '/templates' },
  useSession: () => ({ status: 'ready', user: null, signOut: () => undefined }),
}));
vi.mock('@/features/template-store', () => ({
  getStoreTemplate: vi.fn(async () => Promise.reject(new Error('404'))),
  createStoreTemplate: vi.fn(),
  updateStoreTemplate: vi.fn(),
  publishStoreTemplate: vi.fn(),
  uploadThumbnail: vi.fn(),
  renderThumbnail: vi.fn(),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('EditorShell', () => {
  it('opens the default look as a copy, and works fully when signed out', async () => {
    render(<EditorShell from={null} projectId={null} />);
    expect(await screen.findByText('Editing a copy of “Neon Nocturne”')).toBeTruthy();
    expect((screen.getByLabelText('Template name') as HTMLInputElement).value).toBe('Neon Nocturne (copy)');
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Mine' } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in to save' })).toBeTruthy();
  });

  it('hides and shows the glass panel, keeping the draft', async () => {
    render(<EditorShell from={null} projectId={null} />);
    await screen.findByText('Editing a copy of “Neon Nocturne”');
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide panel' }));
    const panel = screen.getByLabelText('Template editor panel', { selector: 'aside' });
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show panel' }));
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect((screen.getByLabelText('Template name') as HTMLInputElement).value).toBe('Mine');
  });

  it('restores the unsaved document after the sign-in round trip', async () => {
    stashTemplate({ ...NEON_NOCTURNE, name: 'Half done', id: 'half-done' }, UNSAVED_KEY);
    render(<EditorShell from={null} projectId={null} />);
    await waitFor(() => expect((screen.getByLabelText('Template name') as HTMLInputElement).value).toBe('Half done'));
  });

  it('shows the error and offers the default template when the source cannot be loaded', async () => {
    render(<EditorShell from="0190-missing" projectId={null} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start from the default look' }));
    expect(await screen.findByLabelText('Template name')).toBeTruthy();
  });
});
