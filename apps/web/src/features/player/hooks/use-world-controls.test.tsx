import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { SongPlayer } from './use-song-player';
import { useTemplateChoice } from './use-template-choice';
import { useWorldControls } from './use-world-controls';

function fakePlayer(): SongPlayer {
  return {
    clock: { now: () => 3, isPlaying: () => true, rate: () => 1 },
    ready: true,
    playing: true,
    duration: 120,
    run: 1,
    toggle: vi.fn(),
    seek: vi.fn(),
    seekBy: vi.fn(),
    setMuted: vi.fn(),
  };
}

const OTHER = { ...NEON_NOCTURNE, id: 'other', name: 'Other' };

describe('useWorldControls (07-xr-mode requirements 3.4, 4.3)', () => {
  it('forwards the VR commands to the same player functions as the 2D bar', () => {
    const player = fakePlayer();
    const { result } = renderHook(() => useWorldControls(player, 'Song', useTemplateChoice([NEON_NOCTURNE])));
    result.current.toggle();
    result.current.seekBy(-5);
    result.current.seek(0);
    expect(player.toggle).toHaveBeenCalledOnce();
    expect(player.seekBy).toHaveBeenCalledWith(-5);
    expect(player.seek).toHaveBeenCalledWith(0);
    expect(result.current.isPlaying()).toBe(true);
    expect(result.current.duration()).toBe(120);
    expect(result.current.title).toBe('Song');
  });

  it('lists the templates and switches the selected one; unknown ids are ignored', () => {
    const player = fakePlayer();
    const { result } = renderHook(() => {
      const choice = useTemplateChoice([NEON_NOCTURNE, OTHER]);
      return { choice, controls: useWorldControls(player, 'Song', choice) };
    });
    expect(result.current.controls.templates).toEqual([
      { id: 'neon-nocturne', name: 'Neon Nocturne' },
      { id: 'other', name: 'Other' },
    ]);
    expect(result.current.controls.templateId).toBe('neon-nocturne');
    act(() => result.current.controls.selectTemplate('other'));
    expect(result.current.choice.template.id).toBe('other');
    expect(result.current.controls.templateId).toBe('other');
    act(() => result.current.controls.selectTemplate('missing'));
    expect(result.current.choice.template.id).toBe('other');
  });
});
