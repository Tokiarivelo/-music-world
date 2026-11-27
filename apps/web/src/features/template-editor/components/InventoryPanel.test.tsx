import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { InventoryPanel } from './InventoryPanel';

afterEach(cleanup);

describe('InventoryPanel', () => {
  it('lists the objects and reports the selection', () => {
    const onSelect = vi.fn();
    render(<InventoryPanel draft={NEON_NOCTURNE as Template} selected={null} onSelect={onSelect} update={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('marks the selected object', () => {
    render(<InventoryPanel draft={NEON_NOCTURNE as Template} selected="building" onSelect={() => {}} update={vi.fn()} />);
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('turns a built-in city building into a recipe and opens it', () => {
    const onSelect = vi.fn();
    const update = vi.fn();
    render(<InventoryPanel draft={NEON_NOCTURNE as Template} selected={null} onSelect={onSelect} update={update} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit as a recipe' })[0]!);
    expect(update).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('recipe:building_tower');
    const next = update.mock.calls[0]![0](NEON_NOCTURNE as Template) as Template;
    expect(next.recipes.some((r) => r.name === 'building_tower')).toBe(true);
  });

  it('only opens the recipe when it already exists', () => {
    const first = vi.fn();
    render(<InventoryPanel draft={NEON_NOCTURNE as Template} selected={null} onSelect={first} update={(c) => first(c(NEON_NOCTURNE as Template))} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit as a recipe' })[0]!);
    const withRecipe = first.mock.calls[0]![0] as Template;
    cleanup();
    const onSelect = vi.fn();
    const update = vi.fn();
    render(<InventoryPanel draft={withRecipe} selected={null} onSelect={onSelect} update={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit the recipe' }));
    expect(update).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('recipe:building_tower');
  });
});
