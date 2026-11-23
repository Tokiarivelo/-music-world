/**
 * City materials (04-default-template requirement 5). All unlit, so the look does not depend on scene lights.
 *
 * - Buildings: `MeshBasicMaterial` with instance colors, extended with `onBeforeCompile` to draw lit windows. The
 *   window grid is measured in plate metres on the instance-scaled local position, so windows never stretch with the
 *   building height; each building gets its own lit pattern from its position. Three.js keeps its instancing,
 *   multiview and color chunks.
 * - Spikes: additive, depth-write off, vertex colors fading toward the top of each needle (equalizer glow).
 */
import { AdditiveBlending, MeshBasicMaterial } from 'three';
import {
  BUILDING_ROOF_LIGHT,
  BUILDING_WALL_LIGHT,
  BUILDING_WINDOW_LIT_RATE,
  BUILDING_WINDOW_SIZE,
  BUILDING_WINDOW_WHITE,
} from '../constants';

const f = (v: number) => v.toFixed(4);

export const WINDOW_VERTEX_HEAD = /* glsl */ `
varying vec3 vMwLocal;
varying vec3 vMwNormal;
varying vec3 vMwSeed;
varying float vMwHeight;
`;

export const WINDOW_VERTEX_BODY = /* glsl */ `
#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 mwScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vMwSeed = instanceMatrix[3].xyz;
#else
  vec3 mwScale = vec3(1.0);
  vMwSeed = vec3(0.0);
#endif
vMwLocal = position * mwScale;
vMwNormal = normal;
vMwHeight = mwScale.y;
`;

export const WINDOW_FRAGMENT_HEAD = /* glsl */ `
varying vec3 vMwLocal;
varying vec3 vMwNormal;
varying vec3 vMwSeed;
varying float vMwHeight;
float mwHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;

export function windowFragmentBody(): string {
  return /* glsl */ `
#include <color_fragment>
{
  vec3 tint = diffuseColor.rgb;
  float roof = step(0.5, vMwNormal.y);
  float across = abs(vMwNormal.x) > 0.5 ? vMwLocal.z : vMwLocal.x;
  vec2 cell = vec2(across, vMwLocal.y) / vec2(${f(BUILDING_WINDOW_SIZE.w)}, ${f(BUILDING_WINDOW_SIZE.h)});
  vec2 id = floor(cell);
  vec2 g = fract(cell);
  float inside = step(0.2, g.x) * step(g.x, 0.8) * step(0.22, g.y) * step(g.y, 0.78);
  float h = mwHash(vec3(id, dot(vMwNormal, vec3(1.0, 2.0, 3.0))) + vMwSeed * 7.31);
  float lit = step(${f(1 - BUILDING_WINDOW_LIT_RATE)}, h) * inside * (1.0 - roof);
  float up = clamp(vMwLocal.y / max(vMwHeight, 0.001), 0.0, 1.0);
  vec3 wall = mix(tint, vec3(0.35, 0.33, 0.55), 0.5) * ${f(BUILDING_WALL_LIGHT)} * (0.6 + 0.8 * up);
  vec3 win = mix(tint, vec3(1.0), ${f(BUILDING_WINDOW_WHITE)}) * (0.75 + 0.5 * h);
  diffuseColor.rgb = mix(mix(wall, win, lit), tint * ${f(BUILDING_ROOF_LIGHT)}, roof);
}
`;
}

/** Building material: instance color = gradient tint; windows, walls and roofs derived from it in the shader. */
export function buildingMaterial(): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      WINDOW_VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', WINDOW_VERTEX_BODY);
    shader.fragmentShader =
      WINDOW_FRAGMENT_HEAD + shader.fragmentShader.replace('#include <color_fragment>', windowFragmentBody());
  };
  material.customProgramCacheKey = () => 'mw-building-windows-v1';
  return material;
}

/** Equalizer needles: additive glow, brightness from vertex colors (fading to the tips) × instance color. */
export function spikeMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}
