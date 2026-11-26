'use client';

import { useMemo } from 'react';
import { useT } from '@/i18n';
import type { Template } from '@/templates/generated';
import { FOCUS } from '../consts/ui.consts';
import { engineObjects, templateObjects } from '../lib/inventory-model';
import { Section } from './fields/Section';
import { EngineThumb } from './EngineThumb';
import { ObjectThumb } from './ObjectThumb';

export interface InventoryPanelProps {
  draft: Template;
  selected: string | null;
  onSelect(kind: string): void;
}

/** Every object the template uses, with a thumbnail, its role and where it is used. */
export function InventoryPanel({ draft, selected, onSelect }: InventoryPanelProps) {
  const t = useT('editor');
  const objects = useMemo(() => templateObjects(draft), [draft]);
  const engine = useMemo(() => engineObjects(draft), [draft]);
  return (
    <>
    <Section title={t('inventory.title')}>
      <p className="text-xs opacity-70">{t('inventory.count', { count: objects.length })}</p>
      <ul className="flex flex-col gap-2">
        {objects.map((o) => (
          <li key={o.kind}>
            <button
              type="button"
              aria-pressed={selected === o.kind}
              onClick={() => onSelect(o.kind)}
              className={`flex w-full items-center gap-3 rounded border p-2 text-left ${FOCUS} ${selected === o.kind ? 'border-[var(--mw-accent)] bg-white/10' : 'border-white/20 hover:bg-white/5'}`}
            >
              <ObjectThumb template={draft} object={o} />
              <span className="flex min-w-0 flex-col text-sm">
                <span className="truncate font-medium">{o.name}</span>
                <span className="text-xs opacity-70">
                  {t(`inventory.role.${o.role}`)} · {t(`inventory.origin.${o.origin}`)}
                  {o.authored ? ` · ${t('inventory.authored')}` : ''}
                </span>
                <span className="text-xs opacity-70">
                  {t('inventory.usage', { mappings: o.usage.mappings, scenery: o.usage.scenery, zones: o.usage.zones })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
    {engine.length > 0 && (
      <Section title={t('inventory.engine.title')}>
        <p className="text-xs opacity-70">{t(`inventory.engine.intro.${engine[0]!.group}`)}</p>
        <ul className="flex flex-col gap-2" aria-label={t('inventory.engine.title')}>
          {engine.map((o) => {
            const name = t(`inventory.engine.item.${o.id}`);
            return (
              <li key={o.id} className="flex items-center gap-3 rounded border border-white/10 p-2">
                <EngineThumb object={o} color={draft.palette.primary} name={name} />
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="truncate font-medium">{name}</span>
                  <span className="text-xs opacity-70">{t('inventory.engine.badge')}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
    )}
    </>
  );
}
