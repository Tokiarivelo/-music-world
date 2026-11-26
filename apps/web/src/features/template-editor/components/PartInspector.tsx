'use client';

import { useId } from 'react';
import { useT } from '@/i18n';
import { CONTROL } from '../consts/ui.consts';
import {
  NODE_BOUNDS, PRIMITIVES, readNodeField, setNodeNumber, setNodePrimitive,
  type NodeField, type NodePrimitive, type PartNode,
} from '../lib/node-model';

const GROUPS: readonly { key: 'position' | 'rotation' | 'size'; fields: readonly NodeField[] }[] = [
  { key: 'position', fields: ['px', 'py', 'pz'] },
  { key: 'rotation', fields: ['rx', 'ry', 'rz'] },
  { key: 'size', fields: ['sx', 'sy', 'sz'] },
];
const STEP: Readonly<Partial<Record<NodeField, number>>> = { rx: 1, ry: 1, rz: 1, sides: 1, taper: 0.05 };
const SIDED: ReadonlySet<NodePrimitive> = new Set(['cylinder', 'cone', 'prism']);

function NumberField({ label, field, value, onChange }: { label: string; field: NodeField; value: number; onChange(v: number): void }) {
  const id = useId();
  const { min, max } = NODE_BOUNDS[field];
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-xs opacity-80">{label}</label>
      <input
        id={id}
        type="number"
        className={`${CONTROL} w-full`}
        min={min}
        max={max}
        step={STEP[field] ?? 0.01}
        value={Number(value.toFixed(3))}
        onChange={(e) => {
          if (e.target.value !== '') onChange(e.target.valueAsNumber);
        }}
      />
    </div>
  );
}

/** Numeric position, rotation and size of the selected part, and the swap of its primitive. */
export function PartInspector({ nodes, node, onChange }: { nodes: readonly PartNode[]; node: PartNode; onChange(nodes: PartNode[]): void }) {
  const t = useT('editor');
  const primitiveId = useId();
  const axis = ['x', 'y', 'z'] as const;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('inspector.title', { name: node.name })}</legend>
      <div className="flex flex-col gap-1">
        <label htmlFor={primitiveId} className="text-xs opacity-80">{t('inspector.primitive')}</label>
        <select id={primitiveId} className={CONTROL} value={node.primitive} onChange={(e) => onChange(setNodePrimitive(nodes, node.id, e.target.value as NodePrimitive))}>
          {PRIMITIVES.map((p) => (
            <option key={p} value={p}>{t(`parts.primitive.${p}`)}</option>
          ))}
        </select>
      </div>
      {GROUPS.map((g) => (
        <div key={g.key} role="group" aria-label={t(`inspector.${g.key}`)} className="flex flex-col gap-1">
          <span className="text-xs opacity-80">{t(`inspector.${g.key}`)}</span>
          <div className="flex gap-2">
            {g.fields.map((f, i) => (
              <NumberField key={f} field={f} label={`${t(`inspector.${g.key}`)} ${axis[i]!.toUpperCase()}`} value={readNodeField(node, f)} onChange={(v) => onChange(setNodeNumber(nodes, node.id, f, v))} />
            ))}
          </div>
        </div>
      ))}
      {SIDED.has(node.primitive) && (
        <NumberField field="sides" label={t('inspector.sides')} value={readNodeField(node, 'sides')} onChange={(v) => onChange(setNodeNumber(nodes, node.id, 'sides', v))} />
      )}
      {node.primitive === 'prism' && (
        <NumberField field="taper" label={t('inspector.taper')} value={readNodeField(node, 'taper')} onChange={(v) => onChange(setNodeNumber(nodes, node.id, 'taper', v))} />
      )}
    </fieldset>
  );
}
