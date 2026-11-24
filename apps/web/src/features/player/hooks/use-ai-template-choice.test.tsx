import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DirectorState } from '@/features/director';
import type { DirectorResult } from '@/templates/generated';
import { NEON_NOCTURNE } from '@/templates/default';
import { useAiTemplateChoice } from './use-ai-template-choice';

function generated(id: string): DirectorResult {
  return {
    template: { ...NEON_NOCTURNE, id, name: id },
    provider: 'mock',
    model: 'mock-director-1',
    requestedProvider: 'mock',
    cached: false,
    fallbacks: [],
  };
}

function director(results: DirectorResult[]): DirectorState {
  return {
    status: 'idle',
    errorKey: null,
    providers: [],
    provider: 'mock',
    setProvider: vi.fn(),
    generate: vi.fn(),
    templates: results.map((r) => r.template),
    results,
    latest: results.at(-1) ?? null,
  };
}

describe('useAiTemplateChoice', () => {
  it('adds generated templates after the built-ins and selects the newest', () => {
    const hook = renderHook(({ d }) => useAiTemplateChoice(d), { initialProps: { d: director([]) } });
    expect(hook.result.current.template.id).toBe('neon-nocturne');
    hook.rerender({ d: director([generated('ai-mock-a')]) });
    expect(hook.result.current.template.id).toBe('ai-mock-a');
    hook.rerender({ d: director([generated('ai-mock-a'), generated('ai-mock-b')]) });
    expect(hook.result.current.templates.map((t) => t.id)).toEqual(['neon-nocturne', 'ai-mock-a', 'ai-mock-b']);
    expect(hook.result.current.template.id).toBe('ai-mock-b');
    act(() => hook.result.current.selectTemplate('neon-nocturne'));
    expect(hook.result.current.template.id).toBe('neon-nocturne');
  });

  it('lists the requested store template and generated ones before other store templates, selects it once', () => {
    const night = { ...NEON_NOCTURNE, id: 'kiroween-pumpkin-night', name: 'Pumpkin Night' };
    const other = { ...NEON_NOCTURNE, id: 'neon-nocturne-2e3f4a5b' };
    const d = director([generated('ai-mock-a')]);
    const hook = renderHook(({ s }) => useAiTemplateChoice(d, s), {
      initialProps: { s: { templates: [] as (typeof night)[], requestedTemplateId: null as string | null } },
    });
    hook.rerender({ s: { templates: [night, other, NEON_NOCTURNE], requestedTemplateId: night.id } });
    expect(hook.result.current.templates.map((t) => t.id)).toEqual([
      'neon-nocturne',
      'kiroween-pumpkin-night',
      'ai-mock-a',
      'neon-nocturne-2e3f4a5b',
    ]);
    expect(hook.result.current.template.id).toBe('kiroween-pumpkin-night');
    act(() => hook.result.current.selectTemplate('neon-nocturne'));
    hook.rerender({ s: { templates: [night, other], requestedTemplateId: night.id } });
    expect(hook.result.current.template.id).toBe('neon-nocturne');
  });
});
