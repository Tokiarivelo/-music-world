'use client';

import { useId } from 'react';
import { useT } from '@/i18n';
import { MAX_PARTS, RECIPE_BOUNDS } from '../consts/recipe.consts';
import { BUTTON, CONTROL } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { firstError } from '../lib/editor-validate';
import { addPart, recipeTriangles, removeRecipe, renameRecipe, setRecipeNumber, type Recipe } from '../lib/recipe-model';
import { PartEditor } from './PartEditor';
import { BoundedNumber } from './fields/BoundedNumber';
import { FieldError } from './fields/FieldError';

interface RecipeEditorProps extends SectionProps {
  index: number;
  recipe: Recipe;
}

export function RecipeEditor({ errors, update, index, recipe }: RecipeEditorProps) {
  const t = useT('editor');
  const id = useId();
  const nameError = firstError(errors, `recipes.${index}.name`);
  const budgetError = firstError(errors, `recipes.${index}.budget`);
  const triangles = recipeTriangles(recipe);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-sm">
            {t('recipe.name')}
          </label>
          <input
            id={id}
            className={CONTROL}
            defaultValue={recipe.name}
            key={recipe.name}
            maxLength={60}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${id}-error` : undefined}
            onBlur={(e) => update((d) => renameRecipe(d, index, e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') update((d) => renameRecipe(d, index, e.currentTarget.value));
            }}
          />
          <FieldError id={`${id}-error`} error={nameError} />
        </div>
        <button type="button" className={BUTTON} aria-label={t('recipe.remove', { name: recipe.name })} onClick={() => update((d) => removeRecipe(d, index))}>
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BoundedNumber hint={t('recipe.hint.footprint')} label={t('recipe.footprint')} value={recipe.footprint} {...RECIPE_BOUNDS.footprint} onChange={(v) => update((d) => setRecipeNumber(d, index, 'footprint', v))} />
        <BoundedNumber hint={t('recipe.hint.heightScale')} label={t('recipe.heightScale')} value={recipe.heightScale} {...RECIPE_BOUNDS.heightScale} onChange={(v) => update((d) => setRecipeNumber(d, index, 'heightScale', v))} />
        <BoundedNumber
          label={t('recipe.budget')}
          hint={t('recipe.hint.budget')}
          value={recipe.budget.maxTriangles}
          {...RECIPE_BOUNDS.maxTriangles}
          error={budgetError}
          onChange={(v) => update((d) => setRecipeNumber(d, index, 'maxTriangles', v))}
        />
      </div>
      <p role="status" className="text-xs opacity-70">
        {t('recipe.triangles', { count: triangles, max: recipe.budget.maxTriangles })}
      </p>
      <ol className="flex flex-col gap-2">
        {recipe.parts.map((part, i) => (
          <PartEditor key={i} update={update} recipe={index} index={i} part={part} canRemove={recipe.parts.length > 1} />
        ))}
      </ol>
      <button type="button" className={`${BUTTON} self-start`} disabled={recipe.parts.length >= MAX_PARTS} onClick={() => update((d) => addPart(d, index))}>
        {t('part.add')}
      </button>
    </li>
  );
}
