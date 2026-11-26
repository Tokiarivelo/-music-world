'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { BUTTON, CONTROL } from '../consts/ui.consts';
import { ADD_PRIMITIVES, TOOLS } from '../consts/workspace.consts';
import { ARRAY_MAX, ARRAY_MIN, AXES, type Axis, type NodePrimitive, type TransformPart } from '../lib/node-model';
import type { StageTool } from '../lib/object-stage';
import { ToolButton } from './ToolButton';

export interface WorkspaceToolbarProps {
  tool: StageTool;
  hasSelection: boolean;
  full: boolean;
  onTool(tool: StageTool): void;
  onAdd(primitive: NodePrimitive): void;
  onDuplicate(): void;
  onDelete(): void;
  onMirror(axis: Axis): void;
  onArray(axis: Axis, count: number, step: number): void;
  onRadial(count: number): void;
  onFloor(): void;
  onCenter(): void;
  onReset(part: TransformPart): void;
  onFrame(): void;
}

type Menu = 'add' | 'mirror' | 'array' | 'reset' | null;

/** Left tool shelf: transform tools, then create, copy and arrange tools. Menus open beside the shelf. */
export function WorkspaceToolbar(p: WorkspaceToolbarProps) {
  const t = useT('editor');
  const [menu, setMenu] = useState<Menu>(null);
  const [axis, setAxis] = useState<Axis>('x');
  const [count, setCount] = useState(3);
  const [step, setStep] = useState(0.3);
  const toggle = (m: Exclude<Menu, null>) => setMenu((cur) => (cur === m ? null : m));
  const close = () => setMenu(null);
  const axisPicker = (
    <select aria-label={t('parts.tools.axis')} className={CONTROL} value={axis} onChange={(e) => setAxis(e.target.value as Axis)}>
      {AXES.map((a) => (
        <option key={a} value={a}>{a.toUpperCase()}</option>
      ))}
    </select>
  );
  return (
    <div className="relative flex" role="toolbar" aria-orientation="vertical" aria-label={t('workspace.tools')}>
      <div className="flex flex-col gap-1 rounded-xl border border-white/15 bg-[var(--mw-bg)]/85 p-1 backdrop-blur">
        {TOOLS.map(({ tool, key }) => (
          <ToolButton key={tool} icon={tool} label={t(`workspace.tool.${tool}`)} keys={key} active={p.tool === tool} onClick={() => p.onTool(tool)} />
        ))}
        <hr className="my-1 border-white/15" />
        <ToolButton icon="add" label={t('parts.add')} active={menu === 'add'} disabled={p.full} onClick={() => toggle('add')} />
        <ToolButton icon="duplicate" label={t('parts.duplicate')} keys="Shift+D" disabled={!p.hasSelection || p.full} onClick={p.onDuplicate} />
        <ToolButton icon="mirror" label={t('parts.tools.mirror')} active={menu === 'mirror'} disabled={!p.hasSelection || p.full} onClick={() => toggle('mirror')} />
        <ToolButton icon="array" label={t('parts.tools.array')} active={menu === 'array'} disabled={!p.hasSelection || p.full} onClick={() => toggle('array')} />
        <hr className="my-1 border-white/15" />
        <ToolButton icon="floor" label={t('workspace.floor')} disabled={!p.hasSelection} onClick={p.onFloor} />
        <ToolButton icon="center" label={t('workspace.center')} disabled={!p.hasSelection} onClick={p.onCenter} />
        <ToolButton icon="reset" label={t('workspace.resetTransform')} active={menu === 'reset'} disabled={!p.hasSelection} onClick={() => toggle('reset')} />
        <ToolButton icon="frame" label={t('workspace.frame')} keys="F" onClick={p.onFrame} />
        <hr className="my-1 border-white/15" />
        <ToolButton icon="delete" label={t('parts.delete')} keys="X" disabled={!p.hasSelection} onClick={p.onDelete} />
      </div>
      {menu && (
        <div role="group" aria-label={t('workspace.options')} className="absolute left-14 top-0 z-10 flex w-56 flex-col gap-2 rounded-xl border border-white/15 bg-[var(--mw-bg)]/95 p-3 shadow-xl backdrop-blur">
          {menu === 'add' && (
            <>
              <p className="text-xs opacity-70">{t('workspace.addHint')}</p>
              <div className="grid grid-cols-2 gap-1">
                {ADD_PRIMITIVES.map((primitive) => (
                  <button key={primitive} type="button" className={BUTTON} onClick={() => { p.onAdd(primitive); close(); }}>
                    {t(`parts.primitive.${primitive}`)}
                  </button>
                ))}
              </div>
            </>
          )}
          {menu === 'mirror' && (
            <>
              {axisPicker}
              <button type="button" className={BUTTON} onClick={() => { p.onMirror(axis); close(); }}>{t('parts.tools.mirror')}</button>
            </>
          )}
          {menu === 'array' && (
            <>
              {axisPicker}
              <label className="flex flex-col gap-1 text-xs opacity-80">
                {t('parts.tools.count')}
                <input type="number" className={CONTROL} min={ARRAY_MIN} max={ARRAY_MAX} value={count} onChange={(e) => e.target.value !== '' && setCount(e.target.valueAsNumber)} />
              </label>
              <label className="flex flex-col gap-1 text-xs opacity-80">
                {t('parts.tools.step')}
                <input type="number" className={CONTROL} step={0.05} value={step} onChange={(e) => e.target.value !== '' && setStep(e.target.valueAsNumber)} />
              </label>
              <button type="button" className={BUTTON} onClick={() => { p.onArray(axis, count, step); close(); }}>{t('parts.tools.array')}</button>
              <button type="button" className={BUTTON} onClick={() => { p.onRadial(count); close(); }}>{t('workspace.radial')}</button>
            </>
          )}
          {menu === 'reset' && (
            <>
              {(['position', 'rotation', 'size'] as const).map((part) => (
                <button key={part} type="button" className={BUTTON} onClick={() => { p.onReset(part); close(); }}>
                  {t(`inspector.${part}`)}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
