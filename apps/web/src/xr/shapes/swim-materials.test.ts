import { describe, expect, it } from 'vitest';
import { MODELS } from './model-catalog';
import { polishedMaterial, SWIM_MODES } from './polished-materials';
import { SWIMMERS } from '@/engine/swim';

describe('body motion of ocean life', () => {
  it('only animates kinds that have an authored model', () => {
    for (const kind of Object.keys(SWIM_MODES)) expect(MODELS[kind], kind).toBeDefined();
  });

  it('every swimming animal also beats its body or tail (except crawlers)', () => {
    for (const kind of Object.keys(SWIMMERS)) {
      if (['recipe:octopus', 'recipe:seahorse', 'recipe:crab'].includes(kind)) continue;
      expect(SWIM_MODES[kind], kind).toBeDefined();
    }
  });

  it('injects the motion into the vertex shader and shares the audio clock uniform', () => {
    for (const kind of Object.keys(SWIM_MODES)) {
      const material = polishedMaterial(kind, true);
      const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <begin_vertex>\nvoid main(){}' };
      (material.onBeforeCompile as (s: typeof shader) => void)(shader);
      expect(shader.vertexShader, kind).toContain('mwTime * mwSpeed');
      expect(shader.uniforms.mwTime).toBe(material.userData.mwTime);
      expect(shader.uniforms.mwHeight).toBe(material.userData.mwHeight);
    }
  });
});
