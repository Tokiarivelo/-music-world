import { describe, expect, it } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { weatherStore } from '../weather-store';
import { WEATHER_BUDGET, WEATHER_DRAW_CALLS, WeatherView } from './weather-view';

const plan = buildSpawnPlan({ durationSec: 60, tempoBpm: 100, beats: Array.from({ length: 100 }, (_, i) => i * 0.5), notes: [], chords: [], energy: [] }, makeTemplate(), 5);

function draws(view: WeatherView): number {
  let n = 0;
  view.object.traverse((o) => {
    if (o.visible && ('isMesh' in o || 'isLine' in o || 'isSprite' in o || 'isPoints' in o)) n += 1;
  });
  return n;
}

describe('WeatherView', () => {
  it('draws within its budget and shows what each weather needs', () => {
    const view = new WeatherView(plan);
    weatherStore.set('clear');
    view.update(worldStateAt(plan, 10));
    const clear = view.object.children.filter((o) => o.visible).map((o) => o.type);
    expect(clear).toContain('Sprite');
    expect(clear).toContain('Mesh'); // birds
    expect(clear).not.toContain('LineSegments');

    weatherStore.set('storm');
    view.update(worldStateAt(plan, 10));
    const storm = view.object.children.filter((o) => o.visible).map((o) => o.type);
    expect(storm).toContain('LineSegments');
    const clouds = view.object.children.find((o) => 'isInstancedMesh' in o && o.visible && (o as { count: number }).count > 10) as { count: number } | undefined;
    expect(clouds?.count).toBe(WEATHER_BUDGET.clouds);
    expect(draws(view)).toBeLessThanOrEqual(WEATHER_DRAW_CALLS);
    weatherStore.set('auto');
    view.dispose();
  });
});
