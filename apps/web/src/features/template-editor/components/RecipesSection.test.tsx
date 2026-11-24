import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('recipes editor', () => {
  it('adds a shape that is valid and appears in the shape selects', () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a shape' }));
    expect(store.getState().draft.recipes).toHaveLength(1);
    expect(store.getState().errors).toEqual([]);
    expect(screen.getAllByRole('option', { name: 'Recipe: shape' }).length).toBeGreaterThan(0);
    expect(screen.getByText('12 triangles of 500')).toBeTruthy();
  });

  it('edits a part, showing only the fields its operation uses', () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a shape' }));
    expect(screen.queryByLabelText('Part 1 · Floors')).toBeNull();
    fireEvent.change(screen.getByLabelText('Part 1 · Operation'), { target: { value: 'stack' } });
    fireEvent.change(screen.getByLabelText('Part 1 · Floors'), { target: { value: '5' } });
    expect(store.getState().draft.recipes[0]!.parts[0]).toMatchObject({ op: 'stack', levels: 5 });
    expect(screen.getByText('60 triangles of 500')).toBeTruthy();
  });

  it('reports a recipe over its budget on the field', () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a shape' }));
    fireEvent.change(screen.getByLabelText('Triangle budget'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Part 1 · Operation'), { target: { value: 'stack' } });
    expect(screen.getByLabelText('Triangle budget').getAttribute('aria-invalid')).toBe('true');
    expect(store.getState().errors.map((e) => e.code)).toContain('recipeBudget');
  });

  it('renames on blur and removes, keeping one part minimum', () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a shape' }));
    const name = screen.getByLabelText('Shape name');
    fireEvent.change(name, { target: { value: 'Big Fish' } });
    fireEvent.blur(name);
    expect(store.getState().draft.recipes[0]!.name).toBe('big_fish');
    expect((screen.getByRole('button', { name: 'Remove part 1' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove the shape big_fish' }));
    expect(store.getState().draft.recipes).toHaveLength(0);
  });
});
