/**
 * Authored models (I21, rebuilt in Blender in I24 by `scripts/blender/build_models.py`): GLB files in `public/models`
 * (see its LICENSE.md) that replace the procedural shapes of
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
  /** Painted in the colours of the real thing (ocean life): the palette only tints it slightly instead of recolouring it. */
  readonly natural?: boolean;
}

/** Kind (`tree`, `recipe:shark`…) to model. Kinds not listed keep their procedural shape. */
export const MODELS: Readonly<Record<string, ModelSpec>> = {
  tree: { file: 'tree', forward: 'x' },
  conifer: { file: 'conifer', forward: 'x' },
  bush: { file: 'bush', forward: 'x' },
  cloud: { file: 'cloud', forward: 'x' },
  car: { file: 'car', forward: 'z' },
  car_coupe: { file: 'car_coupe', forward: 'z' },
  car_retro: { file: 'car_retro', forward: 'z' },
  bicycle: { file: 'bicycle', forward: 'x' },
  airplane: { file: 'airplane', forward: 'x' },
  // Ocean life (I37, `scripts/blender/build_ocean.py`): used by polished templates that define a recipe of that name.
  'recipe:whale': { file: 'whale', forward: 'x', natural: true },
  'recipe:shark': { file: 'shark', forward: 'x', natural: true },
  'recipe:dolphin': { file: 'dolphin', forward: 'x', natural: true },
  'recipe:manta_ray': { file: 'manta_ray', forward: 'x', natural: true },
  'recipe:sea_turtle': { file: 'sea_turtle', forward: 'x', natural: true },
  'recipe:jellyfish': { file: 'jellyfish', forward: 'x', natural: true },
  'recipe:octopus': { file: 'octopus', forward: 'x', natural: true },
  'recipe:seahorse': { file: 'seahorse', forward: 'x', natural: true },
  'recipe:clownfish': { file: 'clownfish', forward: 'x', natural: true },
  'recipe:fish_school': { file: 'fish_school', forward: 'x', natural: true },
  'recipe:pufferfish': { file: 'pufferfish', forward: 'x', natural: true },
  'recipe:kelp': { file: 'kelp', forward: 'x', natural: true },
  'recipe:seagrass': { file: 'seagrass', forward: 'x', natural: true },
  'recipe:staghorn_coral': { file: 'staghorn_coral', forward: 'x', natural: true },
  'recipe:brain_coral': { file: 'brain_coral', forward: 'x', natural: true },
  'recipe:coral_fan': { file: 'coral_fan', forward: 'x', natural: true },
  'recipe:tube_sponge': { file: 'tube_sponge', forward: 'x', natural: true },
  'recipe:sea_anemone': { file: 'sea_anemone', forward: 'x', natural: true },
  'recipe:starfish': { file: 'starfish', forward: 'x', natural: true },
  'recipe:sea_urchin': { file: 'sea_urchin', forward: 'x', natural: true },
  'recipe:crab': { file: 'crab', forward: 'x', natural: true },
  'recipe:seashell': { file: 'seashell', forward: 'x', natural: true },
  'recipe:shipwreck': { file: 'shipwreck', forward: 'x', natural: true },
  // Enchanted Realm (I40, `scripts/blender/build_fantasy.py`): used by polished templates that define a recipe of that name.
  'recipe:castle': { file: 'castle', forward: 'x', natural: true },
  'recipe:wizard_tower': { file: 'wizard_tower', forward: 'x', natural: true },
  'recipe:mushroom_house': { file: 'mushroom_house', forward: 'x', natural: true },
  'recipe:giant_mushroom': { file: 'giant_mushroom', forward: 'x', natural: true },
  'recipe:crystal_cluster': { file: 'crystal_cluster', forward: 'x', natural: true },
  'recipe:magic_tree': { file: 'magic_tree', forward: 'x', natural: true },
  'recipe:dragon': { file: 'dragon', forward: 'x', natural: true },
  'recipe:glow_flower': { file: 'glow_flower', forward: 'x', natural: true },
};

/**
 * Body variants of a kind: instance slot `s` wears the model `[kind, ...variants][s % (1 + variants.length)]`, each variant
 * being its own InstancedMesh (one more draw call per variant, same material). Cars: hatchback, coupe, retro city car.
 */
export const MODEL_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  car: ['car_coupe', 'car_retro'],
};

export function variantOf(kind: string, slot: number): number {
  const n = 1 + (MODEL_VARIANTS[kind]?.length ?? 0);
  return n === 1 ? 0 : ((slot % n) + n) % n;
}

/** Models painted in natural colours (see `ModelSpec.natural`). */
export function isNaturalModel(kind: string): boolean {
  return MODELS[kind]?.natural === true;
}

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
