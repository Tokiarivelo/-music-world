'use client';

import { useT } from '@/i18n';
import { MAX_RECIPES } from '../consts/recipe.consts';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { addRecipe } from '../lib/recipe-model';
import { RecipeEditor } from './RecipeEditor';
import { Section } from './fields/Section';

export function RecipesSection(props: SectionProps) {
  const t = useT('editor');
  const { draft, update } = props;
  return (
    <Section title={t('section.recipes')}>
      <p className="text-xs opacity-70">
        {draft.recipes.length === 0 ? t('recipe.none') : t('recipe.count', { count: draft.recipes.length, max: MAX_RECIPES })}
      </p>
      <ol className="flex flex-col gap-3">
        {draft.recipes.map((recipe, index) => (
          <RecipeEditor key={index} {...props} index={index} recipe={recipe} />
        ))}
      </ol>
      <button type="button" className={`${BUTTON} self-start`} disabled={draft.recipes.length >= MAX_RECIPES} onClick={() => update((d) => addRecipe(d))}>
        {t('recipe.add')}
      </button>
    </Section>
  );
}
