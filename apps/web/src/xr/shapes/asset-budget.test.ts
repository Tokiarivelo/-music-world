import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Quest 3 budget guard for the bundled assets (I28, `tech.md`: textures < 256 MB, few triangles per instance). A
 * measurement on a headset still decides; this stops an oversized model or texture from being committed unnoticed.
 */
const PUBLIC = join(__dirname, '../../../public');
// Per instance (shapes are drawn many times through one InstancedMesh). The cars are the heaviest (4200 triangles):
// above this, decimate the model or draw far instances with the procedural shape.
const MODEL_TRIANGLES = 4500;
const MODEL_BYTES = 256 * 1024;
const TEXTURE_SIDE = 1024;
const TEXTURE_MEMORY = 64 * 1024 * 1024; // decoded RGBA with mipmaps, all textures together (budget is 256 MB)

function files(dir: string, extension: string): string[] {
  return readdirSync(join(PUBLIC, dir)).filter((name) => name.endsWith(extension));
}

interface Glb {
  meshes?: { primitives: { indices?: number; attributes: Record<string, number>; material?: number }[] }[];
  accessors?: { count: number }[];
  images?: unknown[];
  animations?: unknown[];
}

function readGlb(path: string): Glb {
  const data = readFileSync(path);
  expect(data.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const jsonLength = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8')) as Glb;
}

function triangles(glb: Glb): number {
  let total = 0;
  for (const mesh of glb.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const accessor = primitive.indices ?? primitive.attributes.POSITION;
      total += Math.floor((glb.accessors?.[accessor ?? 0]?.count ?? 0) / 3);
    }
  }
  return total;
}

function jpegSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  let offset = 2;
  while (offset + 9 < data.length) {
    const marker = data[offset + 1] ?? 0;
    if (data[offset] === 0xff && marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  throw new Error(`no size in ${path}`);
}

describe('bundled asset budgets (I28)', () => {
  const models = files('models', '.glb');

  it('ships the models', () => expect(models.length).toBeGreaterThanOrEqual(9));

  it.each(models)('%s stays under the triangle and size budgets, with no embedded image or animation', (name) => {
    const path = join(PUBLIC, 'models', name);
    const glb = readGlb(path);
    expect(triangles(glb)).toBeLessThanOrEqual(MODEL_TRIANGLES);
    expect(statSync(path).size).toBeLessThanOrEqual(MODEL_BYTES);
    expect(glb.images ?? []).toHaveLength(0); // colors are baked into vertex colors: no texture memory
    expect(glb.animations ?? []).toHaveLength(0);
  });

  it('keeps every detail texture small and the decoded total far under the Quest budget', () => {
    let memory = 0;
    for (const name of files('textures', '.jpg')) {
      const { width, height } = jpegSize(join(PUBLIC, 'textures', name));
      expect(Math.max(width, height), name).toBeLessThanOrEqual(TEXTURE_SIDE);
      memory += width * height * 4 * (4 / 3);
    }
    expect(memory).toBeLessThanOrEqual(TEXTURE_MEMORY);
  });
});
