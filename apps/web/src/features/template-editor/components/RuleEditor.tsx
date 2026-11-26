'use client';

import { useT } from '@/i18n';
import {
  COLOR_ROLES,
  HEIGHT_SOURCES,
  STEMS,
  type Rule,
} from '../consts/template-editor.consts';
import { BUTTON } from '../consts/ui.consts';
import type { SectionProps } from '../interfaces/section.types';
import { moveRule, removeRule, updateRule } from '../lib/editor-model';
import { firstError } from '../lib/editor-validate';
import { KindSelect } from './KindSelect';
import { SelectInput } from './fields/SelectInput';
import { TextInput } from './fields/TextInput';

interface RuleEditorProps extends SectionProps {
  index: number;
  rule: Rule;
}

const ANY = '';
const CHORD_VALUES = { [ANY]: null, yes: true, no: false } as const;

function chordValue(chord: boolean | null): string {
  return chord === null ? ANY : chord ? 'yes' : 'no';
}

export function RuleEditor({ draft, errors, update, index, rule }: RuleEditorProps) {
  const t = useT('editor');
  const n = index + 1;
  const at = (field: string) => firstError(errors, `mappings.${index}.${field}`);
  const change = (fn: (r: Rule) => Rule) => update((d) => updateRule(d, index, fn));
  const last = draft.mappings.length - 1;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('rule.title', { n })}</h4>
        <div className="flex gap-1">
          <button type="button" className={BUTTON} disabled={index === 0} onClick={() => update((d) => moveRule(d, index, index - 1))} aria-label={t('rule.up', { n })}>
            ↑
          </button>
          <button type="button" className={BUTTON} disabled={index === last} onClick={() => update((d) => moveRule(d, index, index + 1))} aria-label={t('rule.down', { n })}>
            ↓
          </button>
          <button type="button" className={BUTTON} disabled={draft.mappings.length <= 1} onClick={() => update((d) => removeRule(d, index))} aria-label={t('rule.remove', { n })}>
            ✕
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput
          label={`${t('rule.pitch')} (${n})`}
          value={rule.when.pitch ?? ''}
          hint={t('rule.pitchHint')}
          error={at('when.pitch')}
          onChange={(v) => change((r) => ({ ...r, when: { ...r.when, pitch: v === '' ? null : v } }))}
        />
        <TextInput
          label={`${t('rule.velocity')} (${n})`}
          value={rule.when.velocity ?? ''}
          hint={t('rule.velocityHint')}
          error={at('when.velocity')}
          onChange={(v) => change((r) => ({ ...r, when: { ...r.when, velocity: v === '' ? null : v } }))}
        />
        <SelectInput
          label={`${t('rule.chord')} (${n})`}
          hint={t('rule.hint.chord')}
          value={chordValue(rule.when.chord)}
          options={[
            { value: ANY, label: t('rule.chordAny') },
            { value: 'yes', label: t('rule.chordYes') },
            { value: 'no', label: t('rule.chordNo') },
          ]}
          onChange={(v) => change((r) => ({ ...r, when: { ...r.when, chord: CHORD_VALUES[v as keyof typeof CHORD_VALUES] ?? null } }))}
        />
        <SelectInput
          label={`${t('rule.stem')} (${n})`}
          hint={t('rule.hint.stem')}
          value={rule.when.stem ?? ANY}
          options={[{ value: ANY, label: t('rule.stemAny') }, ...STEMS.map((s) => ({ value: s, label: t(`stem.${s}`) }))]}
          onChange={(v) => change((r) => ({ ...r, when: { ...r.when, stem: v === ANY ? null : (v as (typeof STEMS)[number]) } }))}
        />
        <KindSelect
          label={`${t('rule.spawn')} (${n})`}
          hint={t('rule.hint.spawn')}
          value={rule.spawn}
          recipes={draft.recipes}
          error={at('spawn')}
          onChange={(spawn) => change((r) => ({ ...r, spawn }))}
        />
        <SelectInput
          label={`${t('rule.heightFrom')} (${n})`}
          hint={t('rule.hint.heightFrom')}
          value={rule.heightFrom}
          options={HEIGHT_SOURCES.map((h) => ({ value: h, label: t(`height.${h}`) }))}
          onChange={(v) => change((r) => ({ ...r, heightFrom: v as Rule['heightFrom'] }))}
        />
        <SelectInput
          label={`${t('rule.colorRole')} (${n})`}
          hint={t('rule.hint.colorRole')}
          value={rule.colorRole ?? ANY}
          options={[{ value: ANY, label: t('rule.colorGradient') }, ...COLOR_ROLES.map((c) => ({ value: c, label: t(`role.${c}`) }))]}
          onChange={(v) => change((r) => ({ ...r, colorRole: v === ANY ? null : (v as (typeof COLOR_ROLES)[number]) }))}
        />
      </div>
    </li>
  );
}
