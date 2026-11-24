'use client';

import { useT } from '@/i18n';
import type { SectionProps } from '../interfaces/section.types';
import { EffectsSection } from './EffectsSection';
import { IdentitySection } from './IdentitySection';
import { PaletteSection } from './PaletteSection';
import { StaffSection } from './StaffSection';
import { TerrainSection } from './TerrainSection';

/** Paths the form has a control for; any other error goes to the form-level alert. */
const FIELD_PREFIXES = ['name', 'palette.', 'terrain.', 'staff.', 'fx.', 'mappings.', 'zones.'];

function isFieldPath(path: string): boolean {
  return FIELD_PREFIXES.some((p) => path === p || path.startsWith(p));
}

export function EditorForm(props: SectionProps) {
  const t = useT('editor');
  const { errors } = props;
  const orphans = [...new Set(errors.filter((e) => !isFieldPath(e.path)).map((e) => e.path || '·'))];
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} noValidate>
      <p role="status" className="text-sm">
        {errors.length === 0 ? t('valid') : t('errorCount', { count: errors.length })}
      </p>
      {orphans.length > 0 && (
        <p role="alert" className="text-sm text-[var(--mw-accent)]">
          {t('formError', { fields: orphans.join(', ') })}
        </p>
      )}
      <IdentitySection {...props} />
      <PaletteSection {...props} />
      <TerrainSection {...props} />
      <StaffSection {...props} />
      <EffectsSection {...props} />
    </form>
  );
}
