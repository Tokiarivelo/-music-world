/**
 * Authored models (I21): CC0 GLB files in `public/models` (see its LICENSE.md) that replace the procedural shapes of
 * `object-shapes.ts` / the director's recipes in templates whose `fx.material` is `polished`. Each file is one mesh with
 * its colors baked into vertex colors, so a kind keeps one geometry, one material and one InstancedMesh. The procedural
 * shape is drawn until the file has loaded, and stays if it cannot load. The LLM never sees these files: it only picks
 * kind names (data).
 */
import { BufferGeometry, Matrix4 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ModelSpec {
  /** File name in `/models` without extension. */
  readonly file: string;
  /** Axis the model's length runs along: the model is turned so it runs along +x (a car drives toward +x). */
  readonly forward: 'x' | 'z';
  /** Turn the model around (its nose points to the negative side of `forward`). */
  readonly flip?: boolean;
}

/** Kind (`tree`, `recipe:shark`…) to model. Kinds not listed keep their procedural shape. */
export const MODELS: Readonly<Record<string, ModelSpec>> = {
  tree: { file: 'tree', forward: 'x' },
  conifer: { file: 'conifer', forward: 'x' },
  bush: { file: 'bush', forward: 'x' },
  car: { file: 'car', forward: 'z' },
  bicycle: { file: 'bicycle', forward: 'x' },
  airplane: { file: 'airplane', forward: 'x' },
  'recipe:shark': { file: 'shark', forward: 'z' },
  'recipe:whale': { file: 'whale', forward: 'z' },
  'recipe:clownfish': { file: 'clownfish', forward: 'z' },
  'recipe:sea_turtle': { file: 'sea_turtle', forward: 'x' },
  'recipe:treasure_chest': { file: 'treasure_chest', forward: 'x' },
  'recipe:shipwreck': { file: 'shipwreck', forward: 'z' },
};

export function hasModel(kind: string): boolean {
  return kind in MODELS;
}

/**
 * Fits a model in the instance frame: base at y = 0, centred on x / z, length along +x, uniform scale so its longest
 * horizontal side is 1 (the instance scale then gives `footprint` metres) and its height keeps the model's own
 * proportions given the instance height `nominalHeight` (`footprint / nominalHeight` compensates the non-uniform scale).
 */
export function fitModel(
  geometry: BufferGeometry,
  spec: Pick<ModelSpec, 'forward' | 'flip'>,
  footprint: number,
  nominalHeight: number,
): BufferGeometry {
  const g = geometry.clone();
  if (spec.forward === 'z') g.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
  if (spec.flip) g.applyMatrix4(new Matrix4().makeRotationY(Math.PI));
  g.computeBoundingBox();
  const box = g.boundingBox!;
  g.translate(-(box.max.x + box.min.x) / 2, -box.min.y, -(box.max.z + box.min.z) / 2);
  const side = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  g.scale(1 / side, footprint / (side * nominalHeight), 1 / side);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const cache = new Map<string, Promise<BufferGeometry | null>>();

/** The raw merged geometry of a kind's model, loaded once; `null` when there is none or it cannot load. */
export function loadModelGeometry(kind: string, base = '/models'): Promise<BufferGeometry | null> {
  const spec = MODELS[kind];
  if (!spec) return Promise.resolve(null);
  let promise = cache.get(spec.file);
  if (!promise) {
    promise = new GLTFLoader()
      .loadAsync(`${base}/${spec.file}.glb`)
      .then((gltf) => {
        const parts: BufferGeometry[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const mesh = o as { isMesh?: boolean; geometry?: BufferGeometry; matrixWorld?: Matrix4 };
          if (!mesh.isMesh || !mesh.geometry || !mesh.matrixWorld) return;
          const part = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          for (const name of Object.keys(part.attributes)) if (!['position', 'normal', 'color'].includes(name)) part.deleteAttribute(name);
          parts.push(part.index ? part.toNonIndexed() : part);
        });
        return parts.length ? mergeGeometries(parts) : null;
      })
      .catch(() => null);
    cache.set(spec.file, promise);
  }
  return promise;
}
