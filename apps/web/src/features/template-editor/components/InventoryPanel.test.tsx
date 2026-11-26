import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { InventoryPanel } from './InventoryPanel';

describe('InventoryPanel', () => {
  it('lists the objects and reports the selection', () => {
    const onSelect = vi.fn();
    render(<InventoryPanel draft={NEON_NOCTURNE as Template} selected={null} onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('marks the selected object', () => {
    render(<InventoryPanel draft={NEON_NOCTURNE as Template} selected="building" onSelect={() => {}} />);
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });
});
