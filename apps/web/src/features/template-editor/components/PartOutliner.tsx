'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { CONTROL, FOCUS } from '../consts/ui.consts';
import { reparentNode } from '../lib/gizmo-math';
import { canReparent, MAX_NODES, nodeDepth, renameNode, subtreeIds, toggleHidden, type PartNode } from '../lib/node-model';
import { WorkspaceIcon } from './WorkspaceIcon';

export interface PartOutlinerProps {
  nodes: readonly PartNode[];
  /** Selected ids; the last one is the primary. */
  selection: readonly string[];
  /** Click: `additive` (shift or ctrl) toggles the part in the selection. */
  onSelect(id: string, additive: boolean): void;
  onChange(nodes: PartNode[]): void;
}

const NONE = '';

/**
 * The parts of the object as a tree: click to select (shift or ctrl to add), double-click to rename, the eye hides a
 * part, drag a part onto another to make it a child (or onto the empty area to make it a root). The "Parent" list does
 * the same without a pointer.
 */
export function PartOutliner({ nodes, selection, onSelect, onChange }: PartOutlinerProps) {
  const t = useT('editor');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const primary = selection[selection.length - 1] ?? null;
  const current = nodes.find((n) => n.id === primary) ?? null;
  const commit = (id: string, value: string) => {
    onChange(renameNode(nodes, id, value));
    setRenaming(null);
  };
  const drop = (target: string | null) => {
    if (dragging && canReparent(nodes, dragging, target)) onChange(reparentNode(nodes, dragging, target));
    setDragging(null);
    setOver(null);
  };
  const parents = current ? nodes.filter((n) => canReparent(nodes, current.id, n.id)) : [];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-70">{t('parts.count', { count: nodes.length, max: MAX_NODES })}</p>
      <ul
        role="tree"
        aria-label={t('parts.title')}
        aria-multiselectable
        className={`flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded ${dragging && over === NONE ? 'outline outline-1 outline-dashed outline-[var(--mw-accent)]' : ''}`}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          setOver(NONE);
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop(null);
        }}
      >
        {nodes.map((n) => {
          const picked = selection.includes(n.id);
          const target = dragging !== null && over === n.id && canReparent(nodes, dragging, n.id);
          return (
            <li
              key={n.id}
              role="treeitem"
              aria-selected={picked}
              draggable={renaming !== n.id}
              style={{ paddingLeft: `${(nodeDepth(nodes, n.id) - 1) * 14}px` }}
              className={`flex items-center gap-1 rounded ${target ? 'bg-[var(--mw-accent)]/25' : ''} ${dragging === n.id ? 'opacity-40' : ''}`}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', n.id);
                setDragging(n.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!dragging || dragging === n.id || subtreeIds(nodes, dragging).has(n.id)) return;
                e.preventDefault();
                e.stopPropagation();
                setOver(n.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                drop(n.id);
              }}
            >
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
                  className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${FOCUS} ${picked ? 'bg-[var(--mw-accent)]/25 outline outline-1 outline-[var(--mw-accent)]' : 'hover:bg-white/5'} ${n.hidden ? 'opacity-50 line-through' : ''}`}
                  onClick={(e) => onSelect(n.id, e.shiftKey || e.ctrlKey || e.metaKey)}
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
          );
        })}
      </ul>
      <p className="text-xs opacity-60">{t('workspace.dragHint')}</p>
      {current && (
        <label className="flex flex-col gap-1 text-xs opacity-90">
          {t('workspace.parent')}
          <select
            className={CONTROL}
            value={current.parent ?? NONE}
            onChange={(e) => onChange(reparentNode(nodes, current.id, e.target.value === NONE ? null : e.target.value))}
          >
            <option value={NONE}>{t('workspace.parentNone')}</option>
            {current.parent && !parents.some((p) => p.id === current.parent) && <option value={current.parent}>{nodes.find((n) => n.id === current.parent)?.name}</option>}
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
