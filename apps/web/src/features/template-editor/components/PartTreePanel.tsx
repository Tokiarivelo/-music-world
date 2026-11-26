'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { BUTTON, CONTROL, FOCUS } from '../consts/ui.consts';
import {
  addNode, deleteNode, duplicateNode, MAX_NODES, nodeDepth, PRIMITIVES, renameNode, toggleHidden,
  type NodePrimitive, type PartNode,
} from '../lib/node-model';

export interface PartTreePanelProps {
  nodes: readonly PartNode[];
  selected: string | null;
  onSelect(id: string | null): void;
  onChange(nodes: PartNode[]): void;
}

/** The outliner of an object: its parts indented by depth, with select, rename, hide, duplicate, delete and add. */
export function PartTreePanel({ nodes, selected, onSelect, onChange }: PartTreePanelProps) {
  const t = useT('editor');
  const [primitive, setPrimitive] = useState<NodePrimitive>('box');
  const [renaming, setRenaming] = useState<string | null>(null);
  const current = nodes.find((n) => n.id === selected) ?? null;
  const commitRename = (id: string, value: string) => {
    onChange(renameNode(nodes, id, value));
    setRenaming(null);
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-70">{t('parts.count', { count: nodes.length, max: MAX_NODES })}</p>
      <ul role="tree" aria-label={t('parts.title')} className="flex flex-col gap-1">
        {nodes.map((n) => (
          <li key={n.id} role="treeitem" aria-selected={n.id === selected} style={{ paddingLeft: `${(nodeDepth(nodes, n.id) - 1) * 14}px` }} className="flex items-center gap-1">
            {renaming === n.id ? (
              <input
                autoFocus
                aria-label={t('parts.rename')}
                className={`${CONTROL} min-w-0 flex-1`}
                defaultValue={n.name}
                maxLength={40}
                onBlur={(e) => commitRename(n.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(n.id, e.currentTarget.value);
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <button
                type="button"
                className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${FOCUS} ${n.id === selected ? 'bg-white/15' : 'hover:bg-white/5'} ${n.hidden ? 'opacity-50 line-through' : ''}`}
                onClick={() => onSelect(n.id)}
                onDoubleClick={() => setRenaming(n.id)}
              >
                {n.name}
              </button>
            )}
            <button type="button" className={`${BUTTON} !px-2`} aria-label={`${t('parts.rename')}: ${n.name}`} onClick={() => setRenaming(n.id)}>✎</button>
            <button type="button" className={`${BUTTON} !px-2`} aria-pressed={n.hidden} aria-label={`${t(n.hidden ? 'parts.show' : 'parts.hide')}: ${n.name}`} onClick={() => onChange(toggleHidden(nodes, n.id))}>
              {n.hidden ? '○' : '●'}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BUTTON} disabled={!current || nodes.length >= MAX_NODES} onClick={() => current && onChange(duplicateNode(nodes, current.id))}>
          {t('parts.duplicate')}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!current}
          onClick={() => {
            if (!current) return;
            onChange(deleteNode(nodes, current.id));
            onSelect(null);
          }}
        >
          {t('parts.delete')}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('parts.primitive')} className={CONTROL} value={primitive} onChange={(e) => setPrimitive(e.target.value as NodePrimitive)}>
          {PRIMITIVES.map((p) => (
            <option key={p} value={p}>{t(`parts.primitive.${p}`)}</option>
          ))}
        </select>
        <button
          type="button"
          className={BUTTON}
          disabled={nodes.length >= MAX_NODES}
          onClick={() => {
            const next = addNode(nodes, primitive, selected);
            const grown = next.length > nodes.length ? next : addNode(nodes, primitive, null);
            onChange(grown);
            const added = grown.find((n) => !nodes.some((o) => o.id === n.id));
            if (added) onSelect(added.id);
          }}
        >
          {t('parts.add')}
        </button>
      </div>
    </div>
  );
}
