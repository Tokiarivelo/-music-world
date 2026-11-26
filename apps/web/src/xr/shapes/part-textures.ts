/**
 * Procedural part textures (`PartMaterial.texture`): brick, wood, stone, tile, glass. No image is loaded: the fragment
 * shader draws the pattern from the object-space position, in metres, on the plane the face looks along (a normal from
 * screen derivatives), so the pattern needs no uv and costs nothing in memory. The per-vertex attribute `aTex` holds the
 * pattern id of the part. Patterns multiply the colour (1 = unchanged), they never replace it.
 */
import type { Material } from 'three';

export const PART_TEXTURES = ['none', 'brick', 'wood', 'stone', 'tile', 'glass'] as const;
export type PartTexture = (typeof PART_TEXTURES)[number];

/** Attribute name carrying the pattern id of each vertex. */
export const TEXTURE_ATTRIBUTE = 'aTex';

export function textureId(texture: string | undefined): number {
  const i = PART_TEXTURES.indexOf((texture ?? 'none') as PartTexture);
  return i < 0 ? 0 : i;
}

export const PATTERN_GLSL = /* glsl */ `
float mwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 mwPattern(float id, vec3 p, vec3 n) {
  if (id < 0.5) return vec3(1.0);
  vec2 q = abs(n.y) > 0.6 ? p.xz : (abs(n.x) > abs(n.z) ? p.zy : p.xy);
  if (id < 1.5) { // brick: running bond, dark mortar, a little variation per brick
    vec2 b = q / vec2(0.16, 0.07);
    float row = floor(b.y);
    b.x += 0.5 * mod(row, 2.0);
    vec2 f = fract(b);
    float mortar = min(step(f.x, 0.06) + step(f.y, 0.12), 1.0);
    return mix(vec3(0.85 + 0.3 * mwHash(vec2(floor(b.x), row))), vec3(0.5), mortar);
  }
  if (id < 2.5) { // wood: wavy grain
    float g = sin(q.y * 60.0 + sin(q.x * 9.0) * 2.0) * 0.5 + 0.5;
    return vec3(0.78 + 0.22 * g);
  }
  if (id < 3.5) { // stone: irregular blocks with soft edges
    vec2 b = q / 0.14;
    float v = 0.75 + 0.35 * mwHash(floor(b));
    vec2 f = fract(b);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return vec3(v * (0.5 + 0.5 * smoothstep(0.0, 0.12, edge)));
  }
  if (id < 4.5) { // tile: square grid with grout
    vec2 f = fract(q / 0.1);
    return mix(vec3(1.0), vec3(0.6), min(step(f.x, 0.08) + step(f.y, 0.08), 1.0));
  }
  float s = sin((q.x + q.y) * 18.0) * 0.5 + 0.5; // glass: diagonal glints
  return vec3(0.9 + 0.3 * smoothstep(0.85, 1.0, s));
}
`;

/** Makes a material draw the part textures of geometry that has the `aTex` attribute (keeps an earlier onBeforeCompile). */
export function addPartTextures(material: Material): void {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader =
      'attribute float aTex;\nvarying float vMwTex;\nvarying vec3 vMwObj;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vMwTex = aTex;
#ifdef USE_INSTANCING
  vMwObj = position * vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
  vMwObj = position;
#endif`,
      );
    shader.fragmentShader =
      `varying float vMwTex;\nvarying vec3 vMwObj;\n${PATTERN_GLSL}\n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  diffuseColor.rgb *= mwPattern(vMwTex, vMwObj, normalize(cross(dFdx(vMwObj), dFdy(vMwObj))));`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey()}|mw-part-textures`;
}
