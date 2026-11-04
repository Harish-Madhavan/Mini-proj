import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionTimeline from './TransactionTimeline';

const { showToast, downloadJson, createTraceSnapshot } = vi.hoisted(() => ({
  showToast: vi.fn(),
  downloadJson: vi.fn(),
  createTraceSnapshot: vi.fn(),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('../../utils/download', () => ({
  downloadJson: (...args) => downloadJson(...args),
}));

vi.mock('../../utils/traceSnapshot', () => ({
  createTraceSnapshot: (...args) => createTraceSnapshot(...args),
}));

describe('TransactionTimeline snapshot export', () => {
  it('downloads the active case as an integrity-checked snapshot', async () => {
    const activeCase = {
      id: 'case/one',
      nodes: [{ id: 'source', label: 'Source' }, { id: 'receiver', label: 'Receiver' }],
      links: [{ source: 'source', target: 'receiver', value: '1 BTC' }],
    };
    const snapshot = { capturedAt: '2026-11-04T00:00:00.000Z', integrity: { digest: 'SHA256:TEST' } };
    createTraceSnapshot.mockResolvedValue(snapshot);

    render(<TransactionTimeline activeCase={activeCase} />);
    fireEvent.click(screen.getByRole('button', { name: /download integrity-checked trace snapshot/i }));

    await waitFor(() => {
      expect(createTraceSnapshot).toHaveBeenCalledWith(activeCase);
      expect(downloadJson).toHaveBeenCalledWith(
        snapshot,
        'aegistrace-trace-snapshot-case-one-2026-11-04.json',
      );
    });
  });
});
