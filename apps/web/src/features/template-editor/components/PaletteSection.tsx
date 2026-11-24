'use client';

import { useT } from '@/i18n';
import { PALETTE_ROLES } from '../consts/template-editor.consts';
import type { SectionProps } from '../interfaces/section.types';
import { setPaletteColor } from '../lib/editor-model';
import { firstError } from '../lib/editor-validate';
import { ColorInput } from './fields/ColorInput';
import { Section } from './fields/Section';

export function PaletteSection({ draft, errors, update }: SectionProps) {
  const t = useT('editor');
  return (
    <Section title={t('section.palette')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PALETTE_ROLES.map((role) => (
          <ColorInput
            key={role}
            label={t(`palette.${role}`)}
            hexLabel={t('paletteHex', { role: t(`palette.${role}`) })}
            value={draft.palette[role]}
            error={firstError(errors, `palette.${role}`)}
            onChange={(hex) => update((d) => setPaletteColor(d, role, hex))}
          />
        ))}
      </div>
    </Section>
  );
}
