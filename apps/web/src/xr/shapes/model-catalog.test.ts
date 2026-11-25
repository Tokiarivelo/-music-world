// @vitest-environment node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { fitModel, hasModel, MODELS } from './model-catalog';

const MODELS_DIR = join(process.cwd(), 'public/models');

describe('model catalog (I21)', () => {
  it('every catalogued kind has its GLB file, and the licence file lists it', () => {
    const licence = existsSync(join(MODELS_DIR, 'LICENSE.md'));
    expect(licence).toBe(true);
    for (const [kind, spec] of Object.entries(MODELS)) {
      expect(existsSync(join(MODELS_DIR, `${spec.file}.glb`)), kind).toBe(true);
      expect(hasModel(kind)).toBe(true);
    }
  });

  it('keeps the whole catalog small (a few hundred kilobytes, far under the 40 MB budget)', () => {
    const bytes = readdirSync(MODELS_DIR)
      .filter((f) => f.endsWith('.glb'))
      .reduce((n, f) => n + statSync(join(MODELS_DIR, f)).size, 0);
    expect(bytes).toBeLessThan(2_000_000);
  });

  it('fits a model on the plate: base at 0, centred, length along +x, proportions kept', () => {
    // 2 long (z), 1 wide (x), 0.5 high: a car-like box standing below the origin
    const raw = new BoxGeometry(1, 0.5, 2).translate(3, -4, 5);
    const g = fitModel(raw, { forward: 'z' }, 0.3, 0.16);
    const box = g.boundingBox!;
    expect(box.min.y).toBeCloseTo(0, 6);
    expect((box.max.x + box.min.x) / 2).toBeCloseTo(0, 6);
    expect((box.max.z + box.min.z) / 2).toBeCloseTo(0, 6);
    expect(box.max.x - box.min.x).toBeCloseTo(1, 6); // the length is now along x and spans the unit footprint
    expect(box.max.z - box.min.z).toBeCloseTo(0.5, 6);
    // after the instance scale (footprint 0.3 m, height 0.16 m) the height is 0.5 / 2 of the 0.3 m length
    expect(box.max.y * 0.16).toBeCloseTo((0.5 / 2) * 0.3, 6);
  });

  it('does not touch the source geometry', () => {
    const raw = new BoxGeometry(1, 1, 1);
    fitModel(raw, { forward: 'x', flip: true }, 0.2, 0.2);
    raw.computeBoundingBox();
    expect(raw.boundingBox!.max.x).toBeCloseTo(0.5, 6);
  });
});

describe('model files (Blender build)', () => {
  it('each GLB parses, is one colored mesh and stays under its triangle budget', async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { readFileSync } = await import('node:fs');
    for (const [kind, spec] of Object.entries(MODELS)) {
      const bytes = readFileSync(join(MODELS_DIR, `${spec.file}.glb`));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await new Promise<{ scene: { traverse(cb: (o: unknown) => void): void } }>((resolve, reject) =>
        new GLTFLoader().parse(buffer as ArrayBuffer, '', resolve as never, reject),
      );
      const meshes: { geometry: { attributes: Record<string, unknown>; index: { count: number } | null; getAttribute(n: string): { count: number } } }[] = [];
      gltf.scene.traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh) meshes.push(o as never);
      });
      expect(meshes.length, kind).toBe(1);
      const g = meshes[0]!.geometry;
      expect('color' in g.attributes, `${kind} has vertex colors`).toBe(true);
      const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      expect(tris, kind).toBeLessThanOrEqual(1850);
    }
  });
});
