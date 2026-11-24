import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { ReportTemplateButton } from './ReportTemplateButton';

afterEach(cleanup);

describe('ReportTemplateButton', () => {
  it('sends the chosen reason', async () => {
    const send = vi.fn(async () => undefined);
    render(<ReportTemplateButton storeId="t1" send={send} />);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Thanks, the report was sent.')).toBeTruthy();
    expect(send).toHaveBeenCalledWith('t1', 'spam');
  });

  it('explains a refused report', async () => {
    const send = vi.fn(async () => Promise.reject(new ApiError('TEMPLATE_NOT_REPORTABLE', 409)));
    render(<ReportTemplateButton storeId="t1" send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect((await screen.findByRole('alert')).textContent).toContain('cannot be reported');
  });
});
