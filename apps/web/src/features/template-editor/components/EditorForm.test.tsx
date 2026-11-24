import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { useTemplateDraft } from '../hooks/use-template-draft';
import { createDraftStore } from '../store/template-draft.store';
import { EditorForm } from './EditorForm';

afterEach(cleanup);

function Harness({ store }: { store: ReturnType<typeof createDraftStore> }) {
  const { draft, errors } = useTemplateDraft(store);
  return <EditorForm draft={draft} errors={errors} update={store.update} />;
}

function setup() {
  const store = createDraftStore(NEON_NOCTURNE);
  render(<Harness store={store} />);
  return store;
}

describe('EditorForm', () => {
  it('labels every control and uses the schema bounds', () => {
    setup();
    const size = screen.getByLabelText('Plate size (m)') as HTMLInputElement;
    expect([size.min, size.max, size.step]).toEqual(['4', '40', '0.5']);
    const lookahead = screen.getByLabelText('Look-ahead (s)') as HTMLInputElement;
    expect([lookahead.min, lookahead.max]).toEqual(['1', '8']);
    expect(screen.getByLabelText('Bloom')).toBeTruthy();
    expect(screen.getByLabelText('Pulse on the beat')).toBeTruthy();
    for (const role of ['Background', 'Terrain', 'Primary', 'Accent', 'Secondary', 'Staff']) {
      expect(screen.getByLabelText(role)).toBeTruthy();
      expect(screen.getByLabelText(`${role}, hex code`)).toBeTruthy();
    }
    expect(screen.getByRole('status').textContent).toBe('The template is valid.');
  });

  it('edits the draft through the pure model and clamps numbers', () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Ocean' } });
    fireEvent.change(screen.getByLabelText('Plate size (m)'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('Particles'), { target: { value: 'dust' } });
    fireEvent.click(screen.getByLabelText('Pulse on the beat'));
    const { draft } = store.getState();
    expect(draft).toMatchObject({ name: 'Ocean', id: 'ocean', terrain: { size: 40 }, fx: { particles: 'dust', beatPulse: !NEON_NOCTURNE.fx.beatPulse } });
  });

  it('commits a hex code only when complete, and shows the first error next to the field', () => {
    const store = setup();
    const hex = screen.getByLabelText('Accent, hex code') as HTMLInputElement;
    fireEvent.change(hex, { target: { value: '#12' } });
    expect(store.getState().draft.palette.accent).toBe(NEON_NOCTURNE.palette.accent);
    fireEvent.change(hex, { target: { value: '#AABBCC' } });
    expect(store.getState().draft.palette.accent).toBe('#aabbcc');
    const staff = screen.getByLabelText('Staff, hex code');
    fireEvent.change(staff, { target: { value: store.getState().draft.palette.background } });
    const field = screen.getByLabelText('Staff, hex code') as HTMLInputElement;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(field.getAttribute('aria-describedby')!);
    expect(message?.textContent).toBe('The staff must stand out from the background.');
    expect(within(screen.getByRole('status')).getByText('1 problem to fix')).toBeTruthy();
  });

  it('is usable by keyboard: native controls only, in document order', () => {
    setup();
    const controls = [...document.querySelectorAll('input, select, button')];
    expect(controls.length).toBeGreaterThan(15);
    expect(controls.every((c) => (c as HTMLElement).tabIndex >= 0)).toBe(true);
  });
});
