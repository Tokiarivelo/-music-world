import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalysisProgress } from './AnalysisProgress';

describe('AnalysisProgress', () => {
  it('shows an accessible progress bar and one line per stage', () => {
    render(
      <AnalysisProgress
        job={{
          id: 'j',
          kind: 'analyze_project',
          status: 'running',
          stage: 'transcribe',
          progress: 0.65,
          error: null,
          createdAt: '2026-11-23T10:00:00Z',
          updatedAt: '2026-11-23T10:00:00Z',
        }}
      />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('65');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);
    expect(items[2]?.dataset.state).toBe('active');
    expect(items[1]?.dataset.state).toBe('done');
  });
});
