import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import type { PartNode } from '../lib/node-model';
import { PartTreePanel } from './PartTreePanel';

const HOUSE = STOCK_RECIPES.find((r) => r.name === 'house')!.nodes as PartNode[];

function Harness({ onNodes }: { onNodes: (n: readonly PartNode[]) => void }) {
  const [nodes, setNodes] = useState<PartNode[]>(HOUSE);
  const [sel, setSel] = useState<string | null>(null);
  onNodes(nodes);
  return <PartTreePanel nodes={nodes} selected={sel} onSelect={setSel} onChange={setNodes} />;
}

afterEach(cleanup);

describe('PartTreePanel', () => {
  it('selects, hides, duplicates and deletes a part', () => {
    let latest: readonly PartNode[] = [];
    render(<Harness onNodes={(n) => (latest = n)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Roof' }));
    expect(screen.getByRole('treeitem', { selected: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Roof$/, pressed: false }));
    expect(latest.find((n) => n.id === 'roof')!.hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(latest).toHaveLength(HOUSE.length + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(latest.some((n) => n.id === 'roof')).toBe(false);
  });

  it('adds a part under the selection', () => {
    let latest: readonly PartNode[] = [];
    render(<Harness onNodes={(n) => (latest = n)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Walls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add part' }));
    expect(latest).toHaveLength(HOUSE.length + 1);
    expect(latest.find((n) => !HOUSE.some((h) => h.id === n.id))!.parent).toBe('walls');
  });
});
