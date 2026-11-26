/**
 * Water of the city lakes: the reveal material plus a gentle swell (two crossing wave trains that glint) and, when the
 * viewer wades through, rings spreading from the feet. Positions are plate metres in the mesh's frame (`vMwPlate`).
 */
import { Vector3, type MeshBasicMaterial } from 'three';
import { waterState } from '../water-store';
import { revealMaterial } from './reveal-material';

export function waterMaterial(parameters: ConstructorParameters<typeof MeshBasicMaterial>[0] = {}): MeshBasicMaterial {
  const material = revealMaterial(parameters);
  const uTime = { value: 0 };
  const uWalker = { value: new Vector3() };
  (material.userData as Record<string, unknown>).water = { time: uTime, walker: uWalker };
  const reveal = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    reveal.call(material, shader, renderer);
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWalker = uWalker;
    shader.fragmentShader =
      'uniform float uTime;\nuniform vec3 uWalker;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float mwSwell = sin(dot(vMwPlate, vec2(5.0, 3.1)) + uTime * 1.3) + sin(dot(vMwPlate, vec2(-3.4, 6.2)) + uTime * 1.7);
float mwGlint = smoothstep(1.4, 2.0, mwSwell + sin(dot(vMwPlate, vec2(11.0, -7.0)) - uTime * 2.3));
diffuseColor.rgb *= 1.0 + 0.07 * mwSwell;
diffuseColor.rgb += vec3(0.18, 0.24, 0.3) * mwGlint;
float mwD = distance(vMwPlate, uWalker.xy);
float mwRing = sin(mwD * 28.0 - uTime * 5.0) * exp(-mwD * 2.2) * uWalker.z;
diffuseColor.rgb += vec3(0.16, 0.22, 0.28) * max(mwRing, 0.0) + vec3(0.02) * mwRing;`,
      );
  };
  material.customProgramCacheKey = () => 'mw-city-water-v1';
  return material;
}

/** Call from the water mesh's `onBeforeRender`: copies the shared state into the material's uniforms. */
export function syncWater(material: MeshBasicMaterial): void {
  const uniforms = (material as unknown as { userData: { water?: { time: { value: number }; walker: { value: Vector3 } } } }).userData.water;
  if (!uniforms) return;
  uniforms.time.value = waterState.time;
  uniforms.walker.value.set(waterState.walkerX, waterState.walkerZ, waterState.walking);
}
