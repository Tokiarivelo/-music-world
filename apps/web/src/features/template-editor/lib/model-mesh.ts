import { fitModel, loadModelGeometry, MODELS } from '@/xr/shapes/model-catalog';

export interface ModelMesh {
  /** Non-indexed triangle positions (x, y, z per vertex), fitted like the runtime instance (base at y = 0, length along +x). */
  readonly positions: ArrayLike<number>;
  /** Linear vertex colours of the model, 3 floats per vertex, when it has them. */
  readonly colors?: ArrayLike<number>;
}

/** Linear colour to the value a screen shows (the thumbnails and the 2D canvas work in sRGB). */
export function toDisplayColors(linear: ArrayLike<number>): Float32Array {
  const out = new Float32Array(linear.length);
  for (let i = 0; i < linear.length; i += 1) out[i] = Math.pow(Math.max(0, linear[i]!), 1 / 2.2);
  return out;
}

/** The authored 3D model of a kind, as the world draws it; `null` when the kind has none or the file cannot load. */
export async function loadModelMesh(kind: string): Promise<ModelMesh | null> {
  const spec = MODELS[kind];
  if (!spec) return null;
  const raw = await loadModelGeometry(kind);
  if (!raw) return null;
  const g = fitModel(raw, spec, 1, 1);
  const positions = Float32Array.from(g.getAttribute('position').array);
  const colors = g.hasAttribute('color') ? Float32Array.from(g.getAttribute('color').array) : undefined;
  g.dispose();
  return { positions, colors };
}
