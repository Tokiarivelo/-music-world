import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HANDOFF_KEY, readStashedTemplate, UNSAVED_KEY } from '@/lib/template-stash';
import { NEON_NOCTURNE } from '@/templates/default';
import type { SaveState } from '../hooks/use-save-template';
import type { DraftState } from '../interfaces/template-editor.types';
import { EditorActions } from './EditorActions';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const STATE: DraftState = { source: NEON_NOCTURNE, draft: NEON_NOCTURNE, errors: [], lastValid: NEON_NOCTURNE, draftId: null, dirty: true };
const saver = (over: Partial<SaveState> = {}): SaveState => ({ status: 'idle', errorKey: null, save: vi.fn(), publish: vi.fn(), ...over });

describe('EditorActions', () => {
  it('signed in: saves and publishes, disabled while invalid', () => {
    const s = saver();
    const { rerender } = render(<EditorActions state={STATE} signedIn saver={s} onReset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(s.save).toHaveBeenCalled();
    expect(s.publish).toHaveBeenCalled();
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    const invalid = { ...STATE, errors: [{ path: 'name', code: 'name' as const }] };
    rerender(<EditorActions state={invalid} signedIn saver={s} onReset={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('signed out: offers sign-in only for saving, and keeps the document for the round trip', () => {
    render(<EditorActions state={STATE} signedIn={false} saver={saver()} onReset={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    const link = screen.getByRole('link', { name: 'Sign in to save' });
    expect(link.getAttribute('href')).toBe('/sign-in');
    fireEvent.click(link);
    expect(readStashedTemplate(UNSAVED_KEY)).toEqual(NEON_NOCTURNE);
    expect(readStashedTemplate(HANDOFF_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeTruthy();
  });

  it('shows the server error and the published state', () => {
    const { rerender } = render(<EditorActions state={STATE} signedIn saver={saver({ status: 'error', errorKey: 'RATE_LIMITED' })} onReset={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Too many templates saved. Try again later.');
    rerender(<EditorActions state={STATE} signedIn saver={saver({ status: 'published' })} onReset={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Open the store' })).toBeTruthy();
  });
});
