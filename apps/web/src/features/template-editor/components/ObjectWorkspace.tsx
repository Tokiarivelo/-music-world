'use client';

import { useCallback, useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { BUTTON } from '../consts/ui.consts';
import { NUDGE_METRES, WORKSPACE_ID } from '../consts/workspace.consts';
import type { SectionProps } from '../interfaces/section.types';
import { useObjectHistory } from '../hooks/use-object-history';
import { useWorkspaceShortcuts } from '../hooks/use-workspace-shortcuts';
import { centerOnAxis, dropToFloor } from '../lib/gizmo-math';
import { templateObjects } from '../lib/inventory-model';
import {
  addNode, arrayNode, deleteNode, duplicateNode, effectiveRoots, MAX_NODES, mirrorNode, nudgeNode, radialArrayNode, resetNodeTransform, toggleHidden, updateNodes,
  type Axis, type NodePrimitive, type PartNode, type TransformPart,
} from '../lib/node-model';
import { copyStockAsRecipe, recipeOf } from '../lib/object-source';
import { DEFAULT_SETTINGS, type StageSettings, type StageStats } from '../lib/object-stage';
import type { WorkspaceCommand } from '../lib/shortcuts';
import { BudgetMeter } from './BudgetMeter';
import { ObjectHistoryBar } from './ObjectHistoryBar';
import { PartInspector } from './PartInspector';
import { PartOutliner } from './PartOutliner';
import { ShortcutHelp } from './ShortcutHelp';
import { StageCanvas, type StageRequest } from './StageCanvas';
import { VariantsPanel } from './VariantsPanel';
import { ViewportOptions } from './ViewportOptions';
import { WorkspaceIcon } from './WorkspaceIcon';
import { WorkspaceStatusBar } from './WorkspaceStatusBar';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { Section } from './fields/Section';

export interface ObjectWorkspaceProps extends Pick<SectionProps, 'draft' | 'update'> {
  kind: string;
  onSelectKind(kind: string): void;
  onClose(): void;
}

const NO_NODES: readonly PartNode[] = [];
const NO_STATS: StageStats = { triangles: 0, size: [0, 0, 0] };

/**
 * The full-screen object editor (spec 12, phase 6): a 3D viewport with a gizmo, a tool shelf, the outliner and the
 * properties of the part, like a modelling tool. Every edit goes through the same pure node model and history as before.
 */
export function ObjectWorkspace({ draft, update, kind, onSelectKind, onClose }: ObjectWorkspaceProps) {
  const t = useT('editor');
  const object = useMemo(() => templateObjects(draft).find((o) => o.kind === kind) ?? null, [draft, kind]);
  const index = object?.recipeIndex ?? -1;
  const history = useObjectHistory(draft, index, update);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [settings, setSettings] = useState<StageSettings>(DEFAULT_SETTINGS);
  const [snapOn, setSnapOn] = useState(true);
  const [stats, setStats] = useState<StageStats>(NO_STATS);
  const [help, setHelp] = useState(false);
  const [request, setRequest] = useState<StageRequest | null>(null);
  const recipe = index >= 0 ? draft.recipes[index] ?? null : null;
  const nodes = useMemo<readonly PartNode[]>(() => recipe?.nodes ?? NO_NODES, [recipe]);
  /** Selected ids that still exist; the last one is the primary (inspector, gizmo). */
  const selection = useMemo(() => picked.filter((id) => nodes.some((n) => n.id === id)), [picked, nodes]);
  const selected = nodes.find((n) => n.id === selection[selection.length - 1]) ?? null;
  const roots = useMemo(() => effectiveRoots(nodes, selection), [nodes, selection]);
  const pick = useCallback(
    (id: string | null, additive: boolean) =>
      setPicked((cur) => (id === null ? (additive ? cur : []) : additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id])),
    [],
  );
  const box = useCallback((ids: string[], additive: boolean) => setPicked((cur) => (additive ? [...cur.filter((x) => !ids.includes(x)), ...ids] : ids)), []);

  const change = useCallback((next: readonly PartNode[]) => history.edit((d) => updateNodes(d, index, () => [...next])), [history, index]);
  /** Applies an edit that may add one part and selects it. */
  const grow = useCallback(
    (next: PartNode[]) => {
      if (next.length === nodes.length && next.every((n, i) => n === nodes[i])) return;
      change(next);
      const added = next.filter((n) => !nodes.some((o) => o.id === n.id)).map((n) => n.id);
      if (added.length > 0) setPicked(added);
    },
    [change, nodes],
  );
  const patchSettings = useCallback((patch: Partial<StageSettings>) => setSettings((s) => ({ ...s, ...patch, snap: { ...s.snap, ...(patch.snap ?? {}) } })), []);
  const view = useCallback((v: Extract<StageRequest, { type: 'view' }>['view']) => setRequest((r) => ({ n: (r?.n ?? 0) + 1, type: 'view', view: v })), []);
  const frame = useCallback((ids: readonly string[] | null) => setRequest((r) => ({ n: (r?.n ?? 0) + 1, type: 'frame', ids })), []);
  /** The same edit on every selected root, one after the other. */
  const eachRoot = useCallback((edit: (list: readonly PartNode[], id: string) => PartNode[]) => change(roots.reduce<PartNode[]>((list, id) => edit(list, id), [...nodes])), [change, nodes, roots]);
  const stageSettings = useMemo<StageSettings>(
    () => (snapOn ? settings : { ...settings, snap: { move: 0, rotate: 0, scale: 0 } }),
    [settings, snapOn],
  );

  /** A new part under the selection (a root when the selection is too deep to take a child). */
  const add = useCallback(
    (primitive: NodePrimitive) => {
      const child = addNode(nodes, primitive, selected?.id ?? null);
      grow(child.length > nodes.length ? child : addNode(nodes, primitive, null));
    },
    [grow, nodes, selected],
  );

  const remove = useCallback(() => {
    if (roots.length === 0) return;
    eachRoot(deleteNode);
    setPicked([]);
  }, [eachRoot, roots]);

  const run = useCallback(
    (cmd: WorkspaceCommand) => {
      switch (cmd.type) {
        case 'tool': return patchSettings({ tool: cmd.tool });
        case 'view': return view(cmd.view);
        case 'delete': return remove();
        case 'duplicate': return roots.length > 0 ? grow(roots.reduce<PartNode[]>((list, id) => duplicateNode(list, id), [...nodes])) : undefined;
        case 'hide': return selection.length > 0 ? change(selection.reduce<PartNode[]>((list, id) => toggleHidden(list, id), [...nodes])) : undefined;
        case 'showAll': return change(nodes.map((n) => (n.hidden ? { ...n, hidden: false } : n)));
        case 'frame': return frame(selection);
        case 'isolate': return patchSettings({ isolate: !settings.isolate });
        case 'ortho': return patchSettings({ ortho: !settings.ortho });
        case 'snap': return setSnapOn((on) => !on);
        case 'space': return patchSettings({ space: settings.space === 'world' ? 'local' : 'world' });
        case 'undo': return history.undo();
        case 'redo': return history.redo();
        case 'deselect': return selection.length > 0 ? setPicked([]) : help ? setHelp(false) : onClose();
        case 'help': return setHelp((h) => !h);
        case 'nudge': return roots.length > 0 ? eachRoot((list, id) => nudgeNode(list, id, cmd.axis, cmd.dir * (snapOn && settings.snap.move > 0 ? settings.snap.move : NUDGE_METRES))) : undefined;
        case 'selectAll': return setPicked(nodes.map((n) => n.id));
      }
    },
    [change, eachRoot, frame, grow, help, history, nodes, onClose, patchSettings, remove, roots, selection, settings, snapOn, view],
  );
  useWorkspaceShortcuts(run);

  const header = (
    <header className="flex flex-wrap items-center gap-2 border-b border-white/15 bg-[var(--mw-bg)]/90 px-3 py-2">
      <button type="button" className={`${BUTTON} flex items-center gap-1`} onClick={onClose}>
        <WorkspaceIcon name="close" size={16} />
        {t('workspace.close')}
      </button>
      <h1 className="truncate text-base font-semibold">{t('workspace.title', { name: object?.name ?? kind })}</h1>
      {recipe && (
        <div className="ml-2">
          <ObjectHistoryBar recipe={recipe} opening={history.opening} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onReset={history.reset} />
        </div>
      )}
      <button type="button" className={`${BUTTON} ml-auto`} aria-pressed={help} onClick={() => setHelp((h) => !h)}>
        {t('workspace.shortcuts')} <kbd className="ml-1 text-xs">?</kbd>
      </button>
    </header>
  );

  if (!object || !recipe) {
    const copyable = object !== null && recipeOf(draft, object) !== null;
    return (
      <div id={WORKSPACE_ID} role="dialog" aria-modal="true" aria-label={t('workspace.title', { name: object?.name ?? kind })} className="fixed inset-0 z-40 flex flex-col bg-[var(--mw-bg)] text-[var(--mw-fg,inherit)]">
        {header}
        <div className="flex flex-1 items-center justify-center p-6">
          <Section title={object?.name ?? kind}>
            <p className="max-w-md text-sm opacity-80">{t(copyable ? 'parts.stockNote' : 'parts.noShape')}</p>
            {copyable && object && (
              <button
                type="button"
                className={`${BUTTON} self-start`}
                onClick={() => {
                  const copy = copyStockAsRecipe(draft, object);
                  if (!copy) return;
                  update(() => copy.template);
                  onSelectKind(copy.kind);
                }}
              >
                {t('parts.customize')}
              </button>
            )}
          </Section>
        </div>
      </div>
    );
  }

  return (
    <div id={WORKSPACE_ID} role="dialog" aria-modal="true" aria-label={t('workspace.title', { name: object.name })} className="fixed inset-0 z-40 flex flex-col bg-[var(--mw-bg)]">
      {header}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.07),transparent_70%)]">
            <StageCanvas
              nodes={nodes}
              palette={draft.palette}
              base={draft.palette.primary}
              accent={draft.palette.accent}
              selection={selection}
              settings={stageSettings}
              request={request}
              onPick={pick}
              onBox={box}
              onMarquee={() => undefined}
              onTransform={(next) => change(next)}
              onStats={setStats}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 flex justify-between p-3">
            <div className="pointer-events-auto self-start">
              <WorkspaceToolbar
                tool={settings.tool}
                hasSelection={selection.length > 0}
                full={nodes.length >= MAX_NODES}
                onTool={(tool) => patchSettings({ tool })}
                onAdd={add}
                onDuplicate={() => run({ type: 'duplicate' })}
                onDelete={remove}
                onMirror={(axis: Axis) => selected && grow(mirrorNode(nodes, selected.id, axis))}
                onArray={(axis, count, step) => selected && grow(arrayNode(nodes, selected.id, axis, count, step))}
                onRadial={(count) => selected && grow(radialArrayNode(nodes, selected.id, count))}
                onFloor={() => eachRoot(dropToFloor)}
                onCenter={() => eachRoot(centerOnAxis)}
                onReset={(p: TransformPart) => eachRoot((list, id) => resetNodeTransform(list, id, p))}
                onFrame={() => frame(selection)}
              />
            </div>
            <div className="pointer-events-auto self-start">
              <ViewportOptions settings={settings} snapOn={snapOn} onChange={patchSettings} onSnap={setSnapOn} onView={view} onFrame={() => frame(selection)} />
            </div>
          </div>
          {help && <ShortcutHelp onClose={() => setHelp(false)} />}
        </div>
        <aside aria-label={t('workspace.properties')} className="flex w-[min(22rem,45vw)] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/15 bg-[var(--mw-bg)]/90 p-3">
          <Section title={t('workspace.outliner')}>
            <PartOutliner nodes={nodes} selection={selection} onSelect={pick} onChange={change} />
          </Section>
          <Section title={t('workspace.budget')}>
            <BudgetMeter draft={draft} recipe={recipe} />
          </Section>
          {selected ? <PartInspector nodes={nodes} node={selected} onChange={change} /> : <p className="text-sm opacity-70">{t('workspace.noSelection')}</p>}
          <VariantsPanel draft={draft} update={history.edit} index={index} />
        </aside>
      </div>
      <WorkspaceStatusBar stats={stats} parts={nodes.length} selectedName={selected?.name ?? null} selectedCount={selection.length} tool={settings.tool} snapOn={snapOn} />
    </div>
  );
}
