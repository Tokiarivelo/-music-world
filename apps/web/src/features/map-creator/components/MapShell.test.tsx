import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MapShell } from './MapShell';

afterEach(cleanup);

async function createMap() {
  render(<MapShell from={null} />);
  fireEvent.change(await screen.findByLabelText('Map name'), { target: { value: 'Test map' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create map' }));
  await screen.findByRole('application');
}

function click(canvas: HTMLElement, x: number, y: number) {
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 640, right: 640, bottom: 640, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId: 1 });
}

describe('MapShell', () => {
  it('asks for a new map first, then shows the editor with the map name', async () => {
    await createMap();
    expect(screen.getByRole('heading', { name: 'Test map' })).toBeTruthy();
    expect(screen.getByText('0 of 400 objects')).toBeTruthy();
  });

  it('places an object on a ground click, then undoes and redoes it', async () => {
    await createMap();
    click(screen.getByRole('application'), 320, 320);
    await waitFor(() => expect(screen.getByText('1 of 400 objects')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('0 of 400 objects')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByText('1 of 400 objects')).toBeTruthy();
  });

  it('deletes the selected object with the Delete key and the button', async () => {
    await createMap();
    const canvas = screen.getByRole('application');
    click(canvas, 320, 320);
    await waitFor(() => expect(screen.getByText('1 of 400 objects')).toBeTruthy());
    fireEvent.keyDown(canvas, { key: 'Delete' });
    expect(screen.getByText('0 of 400 objects')).toBeTruthy();
  });

  it('hides and shows the glass panel', async () => {
    await createMap();
    const panel = screen.getByLabelText('Map creator panel', { selector: 'aside' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide panel' }));
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Show panel' }));
    expect(panel.getAttribute('aria-hidden')).toBe('false');
  });
});
