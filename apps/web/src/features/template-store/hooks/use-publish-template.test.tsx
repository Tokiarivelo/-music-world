import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { NEON_NOCTURNE } from '@/templates/default';
import { stored } from '../test-fixtures';
import { usePublishTemplate, type PublishApi } from './use-publish-template';

function api(over: Partial<PublishApi> = {}): PublishApi {
  return {
    create: vi.fn(async () => stored()),
    uploadThumbnail: vi.fn(async () => stored()),
    renderThumbnail: vi.fn(async () => new Blob(['x'], { type: 'image/webp' })),
    ...over,
  };
}

describe('usePublishTemplate', () => {
  it('publishes at once and uploads the generated thumbnail', async () => {
    const fake = api();
    const hook = renderHook(() => usePublishTemplate(fake));
    act(() => hook.result.current.publish(NEON_NOCTURNE));
    await waitFor(() => expect(hook.result.current.status).toBe('published'));
    expect(fake.create).toHaveBeenCalledWith(NEON_NOCTURNE, true);
    expect(fake.uploadThumbnail).toHaveBeenCalledOnce();
    expect(hook.result.current.publishedIds).toEqual(['neon-nocturne']);
  });

  it('keeps the publication when the thumbnail fails, and reports API errors', async () => {
    const noThumb = api({ uploadThumbnail: vi.fn(async () => Promise.reject(new Error('x'))) });
    const ok = renderHook(() => usePublishTemplate(noThumb));
    act(() => ok.result.current.publish(NEON_NOCTURNE));
    await waitFor(() => expect(ok.result.current.status).toBe('published'));
    const failing = api({ create: vi.fn(async () => Promise.reject(new ApiError('TEMPLATE_INVALID', 422))) });
    const bad = renderHook(() => usePublishTemplate(failing));
    act(() => bad.result.current.publish(NEON_NOCTURNE));
    await waitFor(() => expect(bad.result.current.status).toBe('error'));
    expect(bad.result.current.errorKey).toBe('TEMPLATE_INVALID');
  });
});
