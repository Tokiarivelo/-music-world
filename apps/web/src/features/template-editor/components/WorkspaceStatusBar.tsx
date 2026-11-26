'use client';

import { useT } from '@/i18n';
import type { StageStats, StageTool } from '../lib/object-stage';

export interface WorkspaceStatusBarProps {
  stats: StageStats;
  parts: number;
  selectedName: string | null;
  selectedCount: number;
  tool: StageTool;
  snapOn: boolean;
}

/** One line under the viewport: size, triangles, parts, current tool and selection. */
export function WorkspaceStatusBar({ stats, parts, selectedName, selectedCount, tool, snapOn }: WorkspaceStatusBarProps) {
  const t = useT('editor');
  const [w, h, d] = [stats.size[0].toFixed(2), stats.size[1].toFixed(2), stats.size[2].toFixed(2)];
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/15 bg-[var(--mw-bg)]/90 px-3 py-1.5 text-xs">
      <span>{selectedCount > 1 ? t('workspace.status.many', { count: selectedCount }) : t('workspace.status.selected', { name: selectedName ?? '—' })}</span>
      <span>{t('workspace.status.parts', { count: parts })}</span>
      <span>{t('workspace.status.triangles', { count: Math.round(stats.triangles) })}</span>
      <span>{t('workspace.status.size', { w, h, d })}</span>
      <span>{t(`workspace.tool.${tool}`)}{snapOn ? ` · ${t('workspace.snap')}` : ''}</span>
      <span className="ml-auto opacity-70">{t('workspace.status.hint')}</span>
    </p>
  );
}
