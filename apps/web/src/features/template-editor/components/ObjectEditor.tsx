'use client';

import { useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { templateObjects } from '../lib/inventory-model';
import { updateNodes } from '../lib/node-model';
import { copyStockAsRecipe, recipeOf } from '../lib/object-source';
import { ObjectViewport } from './ObjectViewport';
import { ObjectHistoryBar } from './ObjectHistoryBar';
import { useObjectHistory } from '../hooks/use-object-history';
import { BudgetMeter } from './BudgetMeter';
import { PartInspector } from './PartInspector';
import { PartTreePanel } from './PartTreePanel';
import { VariantsPanel } from './VariantsPanel';
import { Section } from './fields/Section';

export interface ObjectEditorProps extends Pick<SectionProps, 'draft' | 'update'> {
  kind: string;
  onSelectKind(kind: string): void;
}

/** Part tree and inspector of the object selected in the inventory. */
export function ObjectEditor({ draft, update, kind, onSelectKind }: ObjectEditorProps) {
  const t = useT('editor');
  const [part, setPart] = useState<string | null>(null);
  const object = useMemo(() => templateObjects(draft).find((o) => o.kind === kind) ?? null, [draft, kind]);
  const history = useObjectHistory(draft, object?.recipeIndex ?? -1, update);
  if (!object) return null;
  const index = object.recipeIndex;
  const recipe = index === null ? null : draft.recipes[index];
  if (index === null || !recipe) {
    const copyable = recipeOf(draft, object) !== null;
    return (
      <Section title={object.name}>
        <p className="text-sm opacity-80">{t(copyable ? 'parts.stockNote' : 'parts.noShape')}</p>
        {copyable && (
          <button
            type="button"
            className={`${BUTTON} self-start`}
            onClick={() => {
              const copy = copyStockAsRecipe(draft, object);
              if (!copy) return;
              update(() => copy.template);
              onSelectKind(copy.kind);
            }}
          >
            {t('parts.customize')}
          </button>
        )}
      </Section>
    );
  }
  const nodes = recipe.nodes ?? [];
  const selected = nodes.find((n) => n.id === part) ?? null;
  const change = (next: typeof nodes) => history.edit((d) => updateNodes(d, index, () => [...next]));
  return (
    <>
    <Section title={t('parts.title')}>
      <ObjectHistoryBar recipe={recipe} opening={history.opening} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onReset={history.reset} />
      <BudgetMeter draft={draft} recipe={recipe} />
      <ObjectViewport nodes={nodes} selected={part} color={draft.palette.primary} highlight={draft.palette.accent} palette={draft.palette} />
      <PartTreePanel nodes={nodes} selected={part} onSelect={setPart} onChange={change} />
      {selected && <PartInspector nodes={nodes} node={selected} onChange={change} />}
    </Section>
    <VariantsPanel draft={draft} update={history.edit} index={index} />
    </>
  );
}
