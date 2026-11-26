import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { TemplateSchema } from '@/templates/generated';
import { addVariant, patchVariant, setNodeMaterial, updateNodes } from './node-model';
import { copyStockAsRecipe } from './object-source';
import { templateObjects } from './inventory-model';
import { diffRecipe, stockOf, type Recipe } from './object-history';
import { validateTemplate } from './editor-validate';

describe('object editor acceptance', () => {
  it('copies the house, paints and textures a part, adds a variant, validates and survives a save round trip', () => {
    const house = templateObjects(NEON_NOCTURNE).find((o) => o.kind === 'building')!;
    const copy = copyStockAsRecipe(NEON_NOCTURNE, house)!;
    const index = copy.template.recipes.length - 1;
    const first = copy.template.recipes[index]!.nodes![0]!.id;
    let t = updateNodes(copy.template, index, (nodes) => setNodeMaterial(nodes, first, { color: '#cc3322', texture: 'brick' }));
    t = patchVariant(addVariant(t, index), index, 0, { name: 'Tall', height: 1.4, jitter: 0.2 });
    expect(validateTemplate(t)).toEqual([]);

    const saved = TemplateSchema.parse(JSON.parse(JSON.stringify(t)));
    const recipe = saved.recipes[index] as Recipe;
    expect(recipe.variants).toEqual([{ name: 'Tall', height: 1.4, jitter: 0.2 }]);
    expect(recipe.nodes![0]!.material).toMatchObject({ color: '#cc3322', texture: 'brick' });
    expect(diffRecipe(stockOf(recipe)!, recipe)).toMatchObject({ changed: 1, variants: 1 });
  });
});
