'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { CONTROL, FOCUS } from '../consts/ui.consts';
import { MAX_NODES, nodeDepth, renameNode, toggleHidden, type PartNode } from '../lib/node-model';
import { WorkspaceIcon } from './WorkspaceIcon';

export interface PartOutlinerProps {
  nodes: readonly PartNode[];
  selected: string | null;
  onSelect(id: string | null): void;
  onChange(nodes: PartNode[]): void;
}

/** The parts of the object as a tree: click to select, double-click to rename, the eye hides a part. */
export function PartOutliner({ nodes, selected, onSelect, onChange }: PartOutlinerProps) {
  const t = useT('editor');
  const [renaming, setRenaming] = useState<string | null>(null);
  const commit = (id: string, value: string) => {
    onChange(renameNode(nodes, id, value));
    setRenaming(null);
  };
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs opacity-70">{t('parts.count', { count: nodes.length, max: MAX_NODES })}</p>
      <ul role="tree" aria-label={t('parts.title')} className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        {nodes.map((n) => (
          <li key={n.id} role="treeitem" aria-selected={n.id === selected} style={{ paddingLeft: `${(nodeDepth(nodes, n.id) - 1) * 14}px` }} className="flex items-center gap-1">
            {renaming === n.id ? (
              <input
                autoFocus
                aria-label={t('parts.rename')}
                className={`${CONTROL} min-w-0 flex-1`}
                defaultValue={n.name}
                maxLength={40}
                onBlur={(e) => commit(n.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit(n.id, e.currentTarget.value);
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <button
                type="button"
                className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${FOCUS} ${n.id === selected ? 'bg-[var(--mw-accent)]/25 outline outline-1 outline-[var(--mw-accent)]' : 'hover:bg-white/5'} ${n.hidden ? 'opacity-50 line-through' : ''}`}
                onClick={() => onSelect(n.id)}
                onDoubleClick={() => setRenaming(n.id)}
              >
                {n.name}
              </button>
            )}
            <button type="button" className={`rounded p-1 hover:bg-white/10 ${FOCUS}`} aria-label={`${t('parts.rename')}: ${n.name}`} onClick={() => setRenaming(n.id)}>
              <span aria-hidden>✎</span>
            </button>
            <button type="button" className={`rounded p-1 hover:bg-white/10 ${FOCUS}`} aria-pressed={n.hidden} aria-label={`${t(n.hidden ? 'parts.show' : 'parts.hide')}: ${n.name}`} onClick={() => onChange(toggleHidden(nodes, n.id))}>
              <WorkspaceIcon name={n.hidden ? 'hide' : 'show'} size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
