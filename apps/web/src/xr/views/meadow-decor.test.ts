import { describe, expect, it } from 'vitest';
import type { InstancedMesh } from 'three';
import type { WorldState } from '@/engine/world-state';
import { MeadowDecorView } from './meadow-decor';

describe('MeadowDecorView (7.webp scenery enhancement)', () => {
  it('creates river, path, wildflowers, and rock instances cleanly', () => {
    const view = new MeadowDecorView(42);
    expect(view.object.name).toBe('meadow-decor');
    expect(view.object.children.length).toBe(4);

    const [path, river, flowers, rocks] = view.object.children as [unknown, unknown, InstancedMesh, InstancedMesh];
    expect(path).toBeDefined();
    expect(river).toBeDefined();
    expect(flowers).toBeDefined();
    expect(rocks).toBeDefined();

    // Flowers and rocks are instanced meshes
    expect(flowers.isInstancedMesh).toBe(true);
    expect(rocks.isInstancedMesh).toBe(true);
    expect(flowers.count).toBeGreaterThan(500);
    expect(rocks.count).toBeGreaterThan(50);

    // Updates time without error
    expect(() => view.update({ t: 1.5, notesOnStaff: [], fallingNotes: [], structures: [], lightArcs: [] } as unknown as WorldState)).not.toThrow();

    // Disposes cleanly
    expect(() => view.dispose()).not.toThrow();
  });
});
