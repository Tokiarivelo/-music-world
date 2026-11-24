import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { stored } from '@/features/template-store/test-fixtures';
import type { QueueItem } from '../api/moderation.api';
import type { ModerationApi } from '../hooks/use-moderation-queue';
import { ModerationPage } from './ModerationPage';

afterEach(cleanup);

const ID_A = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const ID_B = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

function item(id: string, name: string, reasons: QueueItem['reasons']): QueueItem {
  const base = stored({ id, status: 'hidden' });
  return {
    template: { ...base, template: { ...base.template, name } },
    reportCount: reasons.length,
    reasons,
    lastReportedAt: '2026-11-26T11:00:00Z',
  };
}

function fakeApi(over: Partial<ModerationApi> = {}): ModerationApi {
  return {
    list: vi.fn(async () => ({ items: [item(ID_A, 'Night <b>Owl</b>', ['spam', 'offensive']), item(ID_B, 'Day', ['broken'])], nextCursor: null })),
    decide: vi.fn(async () => undefined),
    ...over,
  };
}

describe('ModerationPage', () => {
  it('shows the queue with reasons as text, never as markup', async () => {
    const { container } = render(<ModerationPage api={fakeApi()} />);
    expect(await screen.findByText('Night <b>Owl</b>')).toBeTruthy();
    expect(container.querySelector('h2 b')).toBeNull();
    const [first] = screen.getAllByRole('listitem') as [HTMLElement, ...HTMLElement[]];
    expect(within(first).getByText('Spam')).toBeTruthy();
    expect(within(first).getByText('Offensive')).toBeTruthy();
    expect(within(first).getByText(/2 reports/)).toBeTruthy();
  });

  it('says there is nothing to review on an empty queue', async () => {
    render(<ModerationPage api={fakeApi({ list: vi.fn(async () => ({ items: [], nextCursor: null })) })} />);
    expect(await screen.findByText('Nothing to review.')).toBeTruthy();
  });

  it('restores and removes: the decided item leaves the list', async () => {
    const api = fakeApi();
    render(<ModerationPage api={api} />);
    await screen.findByText('Day');
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByText('Night <b>Owl</b>')).toBeNull());
    expect(api.decide).toHaveBeenCalledWith(ID_A, 'restore');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('Day')).toBeNull());
    expect(api.decide).toHaveBeenCalledWith(ID_B, 'remove');
    expect(await screen.findByText('Nothing to review.')).toBeTruthy();
  });

  it('drops an item that was already decided elsewhere (409) and explains', async () => {
    const api = fakeApi({ decide: vi.fn(async () => Promise.reject(new ApiError('TEMPLATE_NOT_HIDDEN', 409))) });
    render(<ModerationPage api={api} />);
    await screen.findByText('Day');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1] as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toContain('not hidden any more');
    expect(screen.queryByText('Day')).toBeNull();
  });

  it('shows "page does not exist" when the API answers 404', async () => {
    render(<ModerationPage api={fakeApi({ list: vi.fn(async () => Promise.reject(new ApiError('NOT_FOUND', 404))) })} />);
    expect((await screen.findByRole('alert')).textContent).toContain('does not exist');
  });

  it('loads the next page', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [item(ID_A, 'First', ['spam'])], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [item(ID_B, 'Second', ['broken'])], nextCursor: null });
    render(<ModerationPage api={fakeApi({ list })} />);
    await screen.findByText('First');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second')).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith('c1');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
