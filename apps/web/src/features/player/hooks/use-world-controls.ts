'use client';

import { useMemo } from 'react';
import { useT } from '@/i18n';
import type { WorldControls } from '@/features/world-view';
import type { SongPlayer } from './use-song-player';
import type { TemplateChoiceState } from './use-template-choice';

/**
 * Player commands for the VR controls and spatial panel (07-xr-mode requirements 3–4): the same functions as the 2D
 * player bar, so there is one audio player and one clock.
 */
export function useWorldControls(player: SongPlayer, title: string, choice: TemplateChoiceState): WorldControls {
  const t = useT('xr');
  const labels = useMemo(
    () => ({
      restart: t('restart'),
      play: t('play'),
      pause: t('pause'),
      template: t('template'),
      recenter: t('recenter'),
      exit: t('exit'),
      layers: t('layers'),
      layerNames: {
        drums: t('layer.drums'),
        bass: t('layer.bass'),
        vocals: t('layer.vocals'),
        other: t('layer.other'),
        chords: t('layer.chords'),
        lyrics: t('layer.lyrics'),
        fx: t('layer.fx'),
        staff: t('layer.staff'),
      },
    }),
    [t],
  );
  const { clock, toggle, seek, seekBy, duration } = player;
  const { template, templates, selectTemplate } = choice;
  return useMemo(
    () => ({
      toggle,
      seek,
      seekBy,
      isPlaying: () => clock.isPlaying(),
      duration: () => duration,
      title,
      labels,
      templates: templates.map((t) => ({ id: t.id, name: t.name })),
      templateId: template.id,
      selectTemplate,
    }),
    [clock, toggle, seek, seekBy, duration, title, labels, templates, template.id, selectTemplate],
  );
}
