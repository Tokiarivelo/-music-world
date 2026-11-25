/**
 * Attributes a lit material needs and the procedural shapes may lack (I20): smooth or flat normals, and texture
 * coordinates. The shapes have no UVs, so they are projected per triangle along the axis its face looks to (box
 * projection): done once when the geometry is built, so the shader gets textures at no extra cost.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

/** Texture repeats per unit of the normalised shape (the shape is about 1 unit wide). */
export const UV_TILING = 2.5;

/** Returns a non-indexed copy of `geometry` with `normal` (if missing) and a box-projected `uv`. */
export function withLitAttributes(geometry: BufferGeometry, tiling = UV_TILING): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.hasAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let f = 0; f + 2 < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      const [u, w] = ay >= ax && ay >= az ? [v.x, v.z] : ax >= az ? [v.z, v.y] : [v.x, v.y];
      uv[(f + k) * 2] = u * tiling;
      uv[(f + k) * 2 + 1] = w * tiling;
    }
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}
