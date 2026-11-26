import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import type { PartNode } from '../lib/node-model';
import { ObjectViewport } from './ObjectViewport';

afterEach(cleanup);
const NODES = STOCK_RECIPES.find((r) => r.name === 'house')!.nodes as PartNode[];

describe('ObjectViewport', () => {
  it('renders a focusable canvas and takes orbit keys and drags without error', () => {
    render(<ObjectViewport nodes={NODES} selected="roof" color="#112233" highlight="#ff8800" />);
    const canvas = screen.getByRole('img');
    expect(canvas.tabIndex).toBe(0);
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('renders with every part hidden', () => {
    render(<ObjectViewport nodes={NODES.map((n) => ({ ...n, hidden: true }))} selected={null} color="#112233" highlight="#ff8800" />);
    expect(screen.getByRole('img')).toBeTruthy();
  });
});
