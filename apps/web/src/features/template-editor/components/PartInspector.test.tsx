import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import type { PartNode } from '../lib/node-model';
import { PartInspector } from './PartInspector';

afterEach(cleanup);
const NODES = STOCK_RECIPES.find((r) => r.name === 'house')!.nodes as PartNode[];

describe('PartInspector', () => {
  it('edits a number, clamped into the schema bounds', () => {
    const onChange = vi.fn();
    render(<PartInspector nodes={NODES} node={NODES[0]!} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Size X'), { target: { value: '9' } });
    const out = onChange.mock.calls[0]![0] as PartNode[];
    expect(out[0]!.size.x).toBe(2);
  });

  it('swaps the primitive', () => {
    const onChange = vi.fn();
    render(<PartInspector nodes={NODES} node={NODES[0]!} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Primitive'), { target: { value: 'cone' } });
    expect((onChange.mock.calls[0]![0] as PartNode[])[0]!.primitive).toBe('cone');
  });

  it('shows the sides only for a sided primitive', () => {
    const cyl = { ...NODES[0]!, primitive: 'cylinder' as const };
    render(<PartInspector nodes={[cyl]} node={cyl} onChange={() => {}} />);
    expect(screen.getByLabelText('Sides')).toBeTruthy();
    cleanup();
    render(<PartInspector nodes={NODES} node={NODES[0]!} onChange={() => {}} />);
    expect(screen.queryByLabelText('Sides')).toBeNull();
  });
});
