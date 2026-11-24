import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { useTemplateDraft } from '../hooks/use-template-draft';
import { createDraftStore } from '../store/template-draft.store';
import { EditorForm } from './EditorForm';

afterEach(cleanup);

function Harness({ store }: { store: ReturnType<typeof createDraftStore> }) {
  const { draft, errors } = useTemplateDraft(store);
  return <EditorForm draft={draft} errors={errors} update={store.update} />;
}

function setup(source: Template = NEON_NOCTURNE) {
  const store = createDraftStore(source);
  render(<Harness store={store} />);
  return store;
}

describe('mappings and zones editors', () => {
  it('edits a rule: conditions, shape, height and color', () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText('Pitch (1)'), { target: { value: '<48' } });
    fireEvent.change(screen.getByLabelText('Chord (1)'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Instrument (1)'), { target: { value: 'bass' } });
    fireEvent.change(screen.getByLabelText('Shape (1)'), { target: { value: 'spike' } });
    fireEvent.change(screen.getByLabelText('Height from (1)'), { target: { value: 'pitch' } });
    fireEvent.change(screen.getByLabelText('Color (1)'), { target: { value: 'accent' } });
    expect(store.getState().draft.mappings[0]).toMatchObject({
      when: { pitch: '<48', chord: true, stem: 'bass' },
      spawn: 'spike',
      heightFrom: 'pitch',
      colorRole: 'accent',
    });
    fireEvent.change(screen.getByLabelText('Pitch (1)'), { target: { value: '' } });
    expect(store.getState().draft.mappings[0]!.when.pitch).toBeNull();
  });

  it('shows an invalid pitch next to its field and keeps the draft invalid', () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText('Pitch (1)'), { target: { value: 'high' } });
    const field = screen.getByLabelText('Pitch (1)');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(field.getAttribute('aria-describedby')!.split(' ')[0]!)?.textContent).toBe('This value is not allowed.');
    expect(store.getState().errors[0]).toEqual({ path: 'mappings.0.when.pitch', code: 'schema' });
  });

  it('adds, orders and removes rules within 1–32', () => {
    const store = setup();
    const before = store.getState().draft.mappings.map((r) => r.spawn);
    fireEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    const added = store.getState().draft.mappings.length;
    expect(added).toBe(before.length + 1);
    fireEvent.click(screen.getByRole('button', { name: `Move rule ${added} up` }));
    expect(store.getState().draft.mappings[added - 2]!.spawn).toBe('crystal');
    expect((screen.getByRole('button', { name: 'Move rule 1 up' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: `Remove rule ${added}` }));
    expect(store.getState().draft.mappings).toHaveLength(added - 1);
    for (let i = 0; i < 40; i++) fireEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    expect(store.getState().draft.mappings).toHaveLength(32);
    expect((screen.getByRole('button', { name: 'Add a rule' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the last rule: it cannot be removed', () => {
    const store = setup({ ...NEON_NOCTURNE, mappings: [NEON_NOCTURNE.mappings[0]!] });
    expect((screen.getByRole('button', { name: 'Remove rule 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect(store.getState().draft.mappings).toHaveLength(1);
  });

  it('lists recipe kinds read-only and keeps the recipes untouched', () => {
    const recipe = { schema: 'music-world.shape.v1' as const, name: 'tower', parts: [{ op: 'box' as const, of: 'box' as const, width: 0.5, depth: 0.5, height: 0.5, y: 0, sides: 6, taper: 1, levels: 3, shrink: 0.8, count: 4, spread: 0.6, seedOffset: 0 }], budget: { maxTriangles: 500 }, footprint: 0.25, heightScale: 1 };
    const store = setup({ ...NEON_NOCTURNE, recipes: [recipe] });
    expect(screen.getAllByRole('option', { name: 'Recipe: tower' }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Shape (1)'), { target: { value: 'recipe:tower' } });
    expect(store.getState().draft.mappings[0]!.spawn).toBe('recipe:tower');
    expect(store.getState().draft.recipes).toEqual([recipe]);
    expect(store.getState().errors).toEqual([]);
  });

  it('adds, edits and removes zones, and reports an inverted rectangle', () => {
    const store = setup({ ...NEON_NOCTURNE, zones: [] });
    expect(screen.getByText('No zone: every shape can appear on the whole plate.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a zone' }));
    fireEvent.change(screen.getByLabelText('Zone 1 · Shape'), { target: { value: 'spike' } });
    fireEvent.change(screen.getByLabelText('Zone 1 · Left edge'), { target: { value: '0.8' } });
    expect(store.getState().draft.zones[0]).toMatchObject({ kind: 'spike', xMin: 0.8, xMax: 0.5 });
    const xMax = screen.getByLabelText('Zone 1 · Right edge');
    expect(xMax.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(screen.getByLabelText('Zone 1 · Left edge'), { target: { value: '5' } });
    expect(store.getState().draft.zones[0]!.xMin).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove zone 1' }));
    expect(store.getState().draft.zones).toHaveLength(0);
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole('button', { name: 'Add a zone' }));
    expect(store.getState().draft.zones).toHaveLength(16);
  });
});
