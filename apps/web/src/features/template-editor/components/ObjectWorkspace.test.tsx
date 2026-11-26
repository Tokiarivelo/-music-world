import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import { ObjectWorkspace } from './ObjectWorkspace';

vi.mock('./StageCanvas', () => ({ StageCanvas: () => <div data-testid="stage" /> }));

const house = STOCK_RECIPES.find((r) => r.name === 'house')!;
const draft = { ...DEFAULT_TEMPLATE, recipes: [house as unknown as Template['recipes'][number]] } as Template;

function setup(overrides: Partial<Parameters<typeof ObjectWorkspace>[0]> = {}) {
  let current = draft;
  const update = vi.fn((change: (d: Template) => Template) => {
    current = change(current);
  });
  const onClose = vi.fn();
  const view = render(<ObjectWorkspace draft={draft} update={update} kind="recipe:house" onSelectKind={vi.fn()} onClose={onClose} {...overrides} />);
  return { update, onClose, view, get current() { return current; } };
}

afterEach(cleanup);

describe('ObjectWorkspace', () => {
  it('shows the stage, the tool shelf, the outliner and the status bar', () => {
    setup();
    expect(screen.getByTestId('stage')).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeTruthy();
    expect(within(screen.getByRole('tree')).getAllByRole('treeitem').length).toBe(house.nodes.length);
    expect(screen.getByText(/triangles/)).toBeTruthy();
  });

  it('selects a part from the outliner and shows its properties', () => {
    setup();
    expect(screen.getByText(/Click a part/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('tree')).getByText(house.nodes[0]!.name));
    expect(screen.getByText(`Part: ${house.nodes[0]!.name}`)).toBeTruthy();
  });

  it('switches tool with the keyboard', () => {
    setup();
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: 'Rotate' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByRole('button', { name: 'Scale' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('adds a part from the Add menu and selects it', () => {
    const t = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add part' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cone' }));
    expect(t.update).toHaveBeenCalled();
    expect(t.current.recipes[0]!.nodes.length).toBe(house.nodes.length + 1);
  });

  it('deletes the selected part with X and duplicates it with Shift+D', () => {
    const t = setup();
    fireEvent.click(within(screen.getByRole('tree')).getByText(house.nodes[1]!.name));
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    expect(t.current.recipes[0]!.nodes.length).toBeGreaterThan(house.nodes.length);
  });

  it('closes with Escape once nothing is selected, and never while typing', () => {
    const t = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(t.onClose).toHaveBeenCalledTimes(1);
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(t.onClose).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('opens the shortcut sheet with ?', () => {
    setup();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Shortcuts' })).toBeTruthy();
  });

  it('offers to edit a copy of a built-in object', () => {
    const onSelectKind = vi.fn();
    const update = vi.fn();
    render(<ObjectWorkspace draft={draft} update={update} kind="building" onSelectKind={onSelectKind} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }));
    expect(update).toHaveBeenCalled();
    expect(onSelectKind).toHaveBeenCalledWith(expect.stringMatching(/^recipe:/));
  });

  it('selects several parts with shift-click and says so in the status bar', () => {
    setup();
    const tree = screen.getByRole('tree');
    fireEvent.click(within(tree).getByText(house.nodes[0]!.name));
    fireEvent.click(within(tree).getByText(house.nodes[1]!.name), { shiftKey: true });
    expect(screen.getByText('2 parts selected')).toBeTruthy();
    fireEvent.click(within(tree).getByText(house.nodes[1]!.name), { shiftKey: true });
    expect(screen.queryByText('2 parts selected')).toBeNull();
  });

  it('selects every part with A and deletes the selection with X', () => {
    const t = setup();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText(`${house.nodes.length} parts selected`)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'x' });
    expect(t.current.recipes[0]!.nodes).toHaveLength(0);
  });

  it('makes a part a root with the Parent list, keeping its place', () => {
    const t = setup();
    const kid = house.nodes.find((n) => n.parent)!;
    fireEvent.click(within(screen.getByRole('tree')).getByText(kid.name));
    fireEvent.change(screen.getByLabelText('Parent'), { target: { value: '' } });
    expect(t.current.recipes[0]!.nodes.find((n) => n.id === kid.id)!.parent).toBeNull();
  });
});
