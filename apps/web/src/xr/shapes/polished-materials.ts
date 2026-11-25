/**
 * Polished materials (I19): lit PBR (`MeshStandardMaterial`) with sky reflections, for the object kinds, crystals,
 * clusters and recipes of a template whose `fx.material` is `polished`. Buildings (window shader), spikes (additive glow),
 * terrain, staff and glyphs keep their unlit neon materials. Vertex colors carry the baked color and occlusion, the
 * instance color tints them, the scene's ambient and sun lights shade them, and the night-sky HDRI (`public/env`, CC0,
 * see `public/env/LICENSE.md`) gives the reflections. One material per kind, shared by one InstancedMesh.
 */
import {
  EquirectangularReflectionMapping,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  type Texture,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FOLIAGE_SWAY, FOLIAGE_SWAY_SPEED } from './city-materials';

export interface Surface {
  readonly roughness: number;
  readonly metalness: number;
  /** Strength of the sky reflection. */
  readonly reflection: number;
}

/** Surface of each kind. Metal and glossy kinds reflect the sky; plants and clouds stay matte. */
export const SURFACES: Readonly<Record<string, Surface>> = {
  cloud: { roughness: 1, metalness: 0, reflection: 0.15 },
  tree: { roughness: 0.78, metalness: 0, reflection: 0.35 },
  conifer: { roughness: 0.78, metalness: 0, reflection: 0.35 },
  bush: { roughness: 0.82, metalness: 0, reflection: 0.3 },
  car: { roughness: 0.28, metalness: 0.65, reflection: 1.4 },
  bicycle: { roughness: 0.3, metalness: 0.7, reflection: 1.2 },
  airplane: { roughness: 0.25, metalness: 0.7, reflection: 1.4 },
  crystal: { roughness: 0.06, metalness: 0.15, reflection: 1.8 },
  cluster: { roughness: 0.3, metalness: 0.25, reflection: 1.1 },
};
/** Recipes (`recipe:<name>`) and anything else not listed. */
export const DEFAULT_SURFACE: Surface = { roughness: 0.45, metalness: 0.2, reflection: 0.9 };
export const POLISHED_KINDS: ReadonlySet<string> = new Set(Object.keys(SURFACES));

export function isPolishedKind(kind: string): boolean {
  return POLISHED_KINDS.has(kind) || kind.startsWith('recipe:');
}

export function surfaceOf(kind: string): Surface {
  return SURFACES[kind] ?? DEFAULT_SURFACE;
}

/** Detail texture set of a kind (`public/textures/<set>-{detail,normal,rough}.jpg`, CC0 ambientCG), when it has one. */
export const TEXTURE_SET: Readonly<Record<string, string>> = {
  tree: 'bark',
  conifer: 'bark',
  bush: 'foliage',
  car: 'paint',
  bicycle: 'paint',
  airplane: 'metal',
  cluster: 'rock',
};
const NORMAL_SCALE = 0.8;

export interface DetailMaps {
  readonly detail: Texture;
  readonly normal: Texture;
  readonly rough: Texture;
}

const detailCache = new Map<string, Promise<DetailMaps | null>>();

function loadTexture(loader: TextureLoader, url: string, srgb: boolean): Promise<Texture> {
  return loader.loadAsync(url).then((texture) => {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  });
}

/** The three maps of a set, loaded once and shared; `null` when they cannot be loaded (the material stays untextured). */
export function loadDetailMaps(set: string, base = '/textures'): Promise<DetailMaps | null> {
  let promise = detailCache.get(set);
  if (!promise) {
    const loader = new TextureLoader();
    promise = Promise.all([
      loadTexture(loader, `${base}/${set}-detail.jpg`, true),
      loadTexture(loader, `${base}/${set}-normal.jpg`, false),
      loadTexture(loader, `${base}/${set}-rough.jpg`, false),
    ])
      .then(([detail, normal, rough]) => ({ detail, normal, rough }))
      .catch(() => null);
    detailCache.set(set, promise);
  }
  return promise;
}

/** Gives a polished material its detail maps once they have loaded. */
export function applyDetailMaps(material: MeshStandardMaterial, maps: DetailMaps): void {
  material.map = maps.detail;
  material.normalMap = maps.normal;
  material.normalScale = new Vector2(NORMAL_SCALE, NORMAL_SCALE);
  material.roughnessMap = maps.rough;
  material.needsUpdate = true;
}

let skyPromise: Promise<Texture | null> | null = null;

/** The sky used for reflections, loaded once; `null` when it cannot be loaded (materials still work without it). */
export function loadSkyEnvironment(url = '/env/night-sky-1k.hdr'): Promise<Texture | null> {
  skyPromise ??= new RGBELoader()
    .loadAsync(url)
    .then((texture) => {
      texture.mapping = EquirectangularReflectionMapping;
      return texture;
    })
    .catch(() => null);
  return skyPromise;
}

/** Foliage sway on a lit material: same shader hook as `foliageMaterial`, `userData.mwTime` set from the audio clock. */
function addSway(material: MeshStandardMaterial): void {
  const time = { value: 0 };
  material.userData.mwTime = time;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.mwTime = time;
    shader.vertexShader =
      'uniform float mwTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float mwPhase = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 2.3;
#else
  float mwPhase = 0.0;
#endif
  transformed.x += sin(mwTime * ${FOLIAGE_SWAY_SPEED.toFixed(2)} + mwPhase) * position.y * position.y * ${FOLIAGE_SWAY.toFixed(3)};`,
      );
  };
  material.customProgramCacheKey = () => 'mw-polished-sway-v1';
}

const SWAYING: ReadonlySet<string> = new Set(['tree', 'conifer', 'bush']);

/** Lit PBR material of a kind. `sky` (optional) is the reflection environment, `reflectionScale` follows the palette. */
export function polishedMaterial(
  kind: string,
  vertexColors: boolean,
  sky: Texture | null = null,
  reflectionScale = 1,
): MeshStandardMaterial {
  const surface = surfaceOf(kind);
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors,
    roughness: surface.roughness,
    metalness: surface.metalness,
    envMap: sky,
    envMapIntensity: surface.reflection * reflectionScale,
  });
  if (SWAYING.has(kind)) addSway(material);
  return material;
}

/** Gives a polished material its sky once it has loaded. */
export function applySky(material: MeshStandardMaterial, sky: Texture): void {
  material.envMap = sky;
  material.needsUpdate = true;
}
