'use client';

import { useT } from '@/i18n';
import type { SectionProps } from '../interfaces/section.types';
import { MAX_NAME_LENGTH } from '../consts/template-editor.consts';
import { firstError } from '../lib/editor-validate';
import { setName } from '../lib/editor-model';
import { Section } from './fields/Section';
import { TextInput } from './fields/TextInput';

export function IdentitySection({ draft, errors, update }: SectionProps) {
  const t = useT('editor');
  return (
    <Section title={t('section.identity')}>
      <TextInput
        label={t('name')}
        value={draft.name}
        maxLength={MAX_NAME_LENGTH}
        error={firstError(errors, 'name')}
        onChange={(name) => update((d) => setName(d, name))}
      />
    </Section>
  );
}
