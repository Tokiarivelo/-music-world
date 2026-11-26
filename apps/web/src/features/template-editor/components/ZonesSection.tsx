'use client';

import { useT } from '@/i18n';
import { MAX_ZONES } from '../consts/template-editor.consts';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { addZone } from '../lib/editor-model';
import { ZoneEditor } from './ZoneEditor';
import { ZoneMap } from './ZoneMap';
import { Section } from './fields/Section';

export function ZonesSection(props: SectionProps) {
  const t = useT('editor');
  const { draft, update } = props;
  return (
    <Section title={t('section.zones')}>
      <p className="text-sm">{t('zone.intro')}</p>
      {draft.zones.length > 0 && <ZoneMap zones={draft.zones} />}
      <p className="text-xs opacity-70">
        {draft.zones.length === 0 ? t('zone.none') : t('zone.count', { count: draft.zones.length, max: MAX_ZONES })}
      </p>
      <ol className="flex flex-col gap-3">
        {draft.zones.map((zone, index) => (
          <ZoneEditor key={index} {...props} index={index} zone={zone} />
        ))}
      </ol>
      <button type="button" className={`${BUTTON} self-start`} disabled={draft.zones.length >= MAX_ZONES} onClick={() => update((d) => addZone(d))}>
        {t('zone.add')}
      </button>
    </Section>
  );
}
