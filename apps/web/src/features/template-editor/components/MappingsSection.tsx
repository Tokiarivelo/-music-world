'use client';

import { useT } from '@/i18n';
import { MAX_RULES } from '../consts/template-editor.consts';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { addRule } from '../lib/editor-model';
import { RuleEditor } from './RuleEditor';
import { Section } from './fields/Section';

export function MappingsSection(props: SectionProps) {
  const t = useT('editor');
  const { draft, update } = props;
  return (
    <Section title={t('section.mappings')}>
      <p className="text-xs opacity-70">{t('rule.count', { count: draft.mappings.length, max: MAX_RULES })}</p>
      <ol className="flex flex-col gap-3">
        {draft.mappings.map((rule, index) => (
          // Rules have no identity of their own; the position is the identity (order is the semantics).
          <RuleEditor key={index} {...props} index={index} rule={rule} />
        ))}
      </ol>
      <button type="button" className={`${BUTTON} self-start`} disabled={draft.mappings.length >= MAX_RULES} onClick={() => update((d) => addRule(d))}>
        {t('rule.add')}
      </button>
    </Section>
  );
}
