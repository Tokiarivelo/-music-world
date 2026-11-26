import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Template } from '@/templates/generated';
import { createMap, placedOf, placeObject } from '../lib/map-model';
import { rotateHandle, scaleHandle, toScreen, type PlanView } from '../lib/plan-view';
import { MapCanvas } from './MapCanvas';
import { worldSize } from '@/engine/city';

afterEach(cleanup);

function setup(tool: 'place' | 'select' = 'select') {
  let t: Template = createMap({ name: 'm', from: null, environment: 'meadow', plateSize: 16, seed: 1 });
  t = placeObject(t, 'tree', 0, 0).template;
  t = placeObject(t, 'bush', 6, 6).template;
  const view: PlanView = { size: 640, half: worldSize(t) / 2 };
  const fns = { onPlace: vi.fn(), onSelect: vi.fn(), onPreview: vi.fn(), onCommit: vi.fn(), onDelete: vi.fn() };
  render(<MapCanvas template={t} selection={['o1']} tool={tool} snap={0} {...fns} />);
  const canvas = screen.getByRole('application');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 640, right: 640, bottom: 640, x: 0, y: 0, toJSON: () => ({}) });
  const at = (p: { x: number; y: number }) => ({ clientX: p.x, clientY: p.y, pointerId: 1 });
  return { t, view, fns, canvas, at };
}

describe('MapCanvas gizmos', () => {
  it('drags an object to move it, previewing, then commits one step', () => {
    const { t, view, fns, canvas, at } = setup();
    const c = toScreen(view, 0, 0);
    fireEvent.pointerDown(canvas, at(c));
    fireEvent.pointerMove(canvas, at({ x: c.x + 64, y: c.y }));
    expect(fns.onPreview).toHaveBeenCalled();
    fireEvent.pointerUp(canvas, at({ x: c.x + 64, y: c.y }));
    expect(fns.onCommit).toHaveBeenCalledTimes(1);
    const moved = placedOf(fns.onCommit.mock.calls[0]![0] as Template).find((o) => o.id === 'o1')!;
    expect(moved.x).toBeGreaterThan(0);
    expect(placedOf(t).find((o) => o.id === 'o1')!.x).toBe(0);
  });

  it('turns the rotation handle', () => {
    const { view, fns, canvas, at } = setup();
    const c = toScreen(view, 0, 0);
    const h = rotateHandle(c, 1, 0);
    fireEvent.pointerDown(canvas, at(h));
    fireEvent.pointerUp(canvas, at({ x: c.x + 40, y: c.y })); // pointer to the right: 90 degrees
    const o = placedOf(fns.onCommit.mock.calls[0]![0] as Template).find((x) => x.id === 'o1')!;
    expect(o.yaw).toBeCloseTo(90, 3);
  });

  it('pulls the scale handle', () => {
    const { view, fns, canvas, at } = setup();
    const c = toScreen(view, 0, 0);
    fireEvent.pointerDown(canvas, at(scaleHandle(c, 1)));
    fireEvent.pointerUp(canvas, at({ x: c.x + 60, y: c.y }));
    const o = placedOf(fns.onCommit.mock.calls[0]![0] as Template).find((x) => x.id === 'o1')!;
    expect(o.scale).toBeGreaterThan(1);
  });

  it('selects several objects with a box on the ground', () => {
    const { view, fns, canvas, at } = setup();
    const a = toScreen(view, -2, -2);
    const b = toScreen(view, 8, 8);
    fireEvent.pointerDown(canvas, at(a));
    fireEvent.pointerMove(canvas, at(b));
    fireEvent.pointerUp(canvas, at(b));
    expect(fns.onSelect).toHaveBeenLastCalledWith(['o1', 'o2']);
  });

  it('places in place mode and selects instead of placing on an object', () => {
    const { view, fns, canvas, at } = setup('place');
    fireEvent.pointerDown(canvas, at(toScreen(view, -5, 5)));
    expect(fns.onPlace).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(canvas, at(toScreen(view, 6, 6)));
    expect(fns.onPlace).toHaveBeenCalledTimes(1);
    expect(fns.onSelect).toHaveBeenLastCalledWith(['o2']);
  });
});
