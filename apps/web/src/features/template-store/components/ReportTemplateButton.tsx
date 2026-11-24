'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { REPORT_REASONS, type ReportReason } from '../consts/template-store.consts';
import { useReportTemplate } from '../hooks/use-report-template';

interface ReportTemplateButtonProps {
  storeId: string;
  /** Injected in tests; defaults to `POST /api/templates/{id}/reports`. */
  send?: (id: string, reason: ReportReason) => Promise<void>;
}

/** "Report" disclosure with a closed list of reasons (06-template-store requirement 6). */
export function ReportTemplateButton({ storeId, send }: ReportTemplateButtonProps) {
  const t = useT('store');
  const [reason, setReason] = useState<ReportReason>('offensive');
  const { status, errorKey, report } = useReportTemplate(storeId, send);
  if (status === 'sent') return <p className="text-xs opacity-80">{t('report.sent')}</p>;
  const selectId = `report-reason-${storeId}`;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer opacity-70">{t('report.open')}</summary>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          {t('report.reason')}
        </label>
        <select
          id={selectId}
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          className="rounded border border-white/20 bg-transparent px-1 py-0.5"
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r} className="bg-[var(--mw-bg)]">
              {t(`reason.${r}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={status === 'sending'}
          onClick={() => report(reason)}
          className="rounded border border-white/30 px-2 py-0.5 disabled:opacity-50"
        >
          {t('report.send')}
        </button>
      </div>
      {status === 'error' && (
        <p role="alert" className="text-[var(--mw-accent)]">
          {t.error(errorKey)}
        </p>
      )}
    </details>
  );
}
