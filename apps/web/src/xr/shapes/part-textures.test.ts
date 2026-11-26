import { MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { addPartTextures, PART_TEXTURES, PATTERN_GLSL, textureId } from './part-textures';

describe('part-textures', () => {
  it('maps names to ids and unknown names to none', () => {
    expect(PART_TEXTURES.map(textureId)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(textureId('lava')).toBe(0);
    expect(textureId(undefined)).toBe(0);
  });

  it('has a branch for every pattern', () => {
    for (const word of ['brick', 'wood', 'stone', 'tile', 'glass']) expect(PATTERN_GLSL).toContain(word);
  });

  it('patches the shaders and keeps an earlier onBeforeCompile', () => {
    const material = new MeshBasicMaterial();
    let earlier = false;
    material.onBeforeCompile = () => { earlier = true; };
    addPartTextures(material);
    const shader = {
      vertexShader: '#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>',
      uniforms: {},
    } as unknown as Parameters<MeshBasicMaterial['onBeforeCompile']>[0];
    material.onBeforeCompile(shader, null as never);
    expect(earlier).toBe(true);
    expect(shader.vertexShader).toContain('attribute float aTex');
    expect(shader.fragmentShader).toContain('mwPattern(vMwTex');
    expect(material.customProgramCacheKey()).toContain('mw-part-textures');
  });
});
