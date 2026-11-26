/**
 * Reveal (I39): the streets, lakes and traffic lights of the city exist only inside a radius around the centre that
 * grows with the music (`cityFront`). Patches a `MeshBasicMaterial` so fragments beyond `uReveal` (plate metres, in the
 * mesh's own frame) are dropped, with a thin bright rim on the front line.
 */
import { MeshBasicMaterial, type IUniform } from 'three';

export interface RevealMaterial extends MeshBasicMaterial {
  userData: { reveal: IUniform<number> };
}

const RIM = 0.25; // width of the bright rim, plate metres

export function revealMaterial(parameters: ConstructorParameters<typeof MeshBasicMaterial>[0] = {}): RevealMaterial {
  const material = new MeshBasicMaterial(parameters) as RevealMaterial;
  const reveal: IUniform<number> = { value: 1e6 };
  material.userData.reveal = reveal;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = reveal;
    shader.vertexShader = 'varying vec2 vMwPlate;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMwPlate = transformed.xz;');
    shader.fragmentShader =
      'uniform float uReveal;\nvarying vec2 vMwPlate;\n' +
      shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat mwR = length(vMwPlate);\nif (mwR > uReveal) discard;')
        .replace('#include <opaque_fragment>', `float mwRim = smoothstep(uReveal - ${RIM.toFixed(3)}, uReveal, mwR);\noutgoingLight += vec3(0.5, 0.45, 0.2) * mwRim;\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'mw-city-reveal-v1';
  return material;
}

export function setReveal(material: MeshBasicMaterial, radius: number): void {
  const reveal = (material.userData as { reveal?: IUniform<number> }).reveal;
  if (reveal) reveal.value = radius;
}
