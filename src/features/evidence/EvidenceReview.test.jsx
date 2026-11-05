import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EvidenceReview from './EvidenceReview.jsx';
import * as useCaseModule from '../../hooks/useCase';
import * as useToastModule from '../../hooks/useToast';
import * as downloadModule from '../../utils/download';

vi.mock('../../hooks/useCase');
vi.mock('../../hooks/useToast');
vi.mock('../../utils/download');

describe('EvidenceReview UI Component', () => {
  const addEvidenceClaimMock = vi.fn();
  const updateEvidenceClaimReviewMock = vi.fn();
  const updatePathReviewMock = vi.fn();
  const downloadJsonMock = vi.fn();
  const showToastMock = vi.fn();

  const mockCase = {
    id: 'case_evidence_test_01',
    title: 'Operation Blue Sky',
    currency: 'BTC',
    nodes: [
      { id: 'suspect_root', type: 'suspect', balance: '3.0' },
      { id: 'terminal_dest', type: 'wallet', balance: '1.5', details: { address: 'bc1qdestendpoint123', outspendSpent: false } },
    ],
    links: [
      {
        source: 'suspect_root',
        target: 'terminal_dest',
        value: '1.5',
        txid: 'tx_flow_alpha_999',
        blockHeight: 850200,
        blockTime: 1730000000,
      },
    ],
    traceMeta: {
      stats: { prunedBranches: [], omittedNodeCount: 0, omittedLinkCount: 0 },
      addressHistoryScan: { complete: true, pagesScanned: 1, transactionsScanned: 10 },
      warnings: [],
      confidence: 0.85,
    },
    evidenceClaims: [
      {
        id: 'claim_existing_01',
        origin: 'investigator_entered',
        evidenceClass: 'attribution_hypothesis',
        classification: 'Attribution hypothesis',
        statement: 'Suspect address controlled by Syndicate Leader A',
        sourceReference: 'Confidential Informant CI-44',
        sourceStrength: 'Investigator-entered reference',
        status: 'recorded',
        review: { status: 'unreviewed', reviewerNote: '', reviewedAt: null },
      },
    ],
    pathReviews: {},
    evidenceClaimReviews: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useToastModule, 'useToast').mockReturnValue({ showToast: showToastMock });
    vi.spyOn(downloadModule, 'downloadJson').mockImplementation(downloadJsonMock);
    vi.spyOn(useCaseModule, 'useCase').mockReturnValue({
      activeCase: mockCase,
      addEvidenceClaim: addEvidenceClaimMock,
      updateEvidenceClaimReview: updateEvidenceClaimReviewMock,
      updatePathReview: updatePathReviewMock,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders header, executive KPI metrics, and evidentiary banner', () => {
    render(<EvidenceReview />);

    expect(screen.getByText('Evidence Review & Quality Audit')).toBeDefined();
    expect(screen.getByText(/Claim Review Cadence/i)).toBeDefined();
    expect(screen.getByText(/Competing Routes/i)).toBeDefined();
    expect(screen.getByText(/Evidentiary Governance/i)).toBeDefined();
    expect(screen.getByText('Suspect address controlled by Syndicate Leader A')).toBeDefined();
  });

  it('filters claims by search query', () => {
    render(<EvidenceReview />);

    const searchInput = screen.getByLabelText('Filter claims by search query');
    fireEvent.change(searchInput, { target: { value: 'Syndicate Leader A' } });
    expect(screen.getByText('Suspect address controlled by Syndicate Leader A')).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'nonexistent keyword' } });
    expect(screen.getByText('No claims match your filter criteria.')).toBeDefined();
  });

  it('allows investigators to record new evidence claims', () => {
    render(<EvidenceReview />);

    const statementInput = screen.getByLabelText('Claim statement');
    const sourceInput = screen.getByLabelText('Claim source reference');

    fireEvent.change(statementInput, { target: { value: 'Exchange KYC confirmed user passport' } });
    fireEvent.change(sourceInput, { target: { value: 'FIU Subpoena Response #2026-99' } });

    const addClaimBtn = screen.getByText('Add Claim');
    fireEvent.click(addClaimBtn);

    expect(addEvidenceClaimMock).toHaveBeenCalledTimes(1);
    expect(addEvidenceClaimMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statement: 'Exchange KYC confirmed user passport',
        sourceReference: 'FIU Subpoena Response #2026-99',
        classification: 'Attribution hypothesis',
        origin: 'investigator_entered',
      })
    );
  });

  it('allows investigators to update a claim review status with reviewer notes', () => {
    render(<EvidenceReview />);

    const noteInputs = screen.getAllByLabelText(/Reviewer note for/i);
    fireEvent.change(noteInputs[0], { target: { value: 'Verified against court-sealed passport copy' } });

    const statusSelects = screen.getAllByLabelText(/Review state for/i);
    fireEvent.change(statusSelects[0], { target: { value: 'independently_confirmed' } });

    expect(updateEvidenceClaimReviewMock).toHaveBeenCalledTimes(2);
    expect(updateEvidenceClaimReviewMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: 'independently_confirmed',
        reviewerNote: 'Verified against court-sealed passport copy',
      })
    );
  });

  it('allows investigators to save alternative path assessments', () => {
    render(<EvidenceReview />);

    const rationaleInputs = screen.getAllByLabelText(/Rationale for path/i);
    expect(rationaleInputs.length).toBeGreaterThan(0);

    fireEvent.change(rationaleInputs[0], { target: { value: 'Direct flow matches confirmed banking dwell time' } });

    const assessmentSelects = screen.getAllByLabelText(/Assessment for path/i);
    fireEvent.change(assessmentSelects[0], { target: { value: 'selected_for_review' } });

    const saveBtns = screen.getAllByText('Save Assessment');
    fireEvent.click(saveBtns[0]);

    expect(updatePathReviewMock).toHaveBeenCalledTimes(1);
    expect(updatePathReviewMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: 'selected_for_review',
        rationale: 'Direct flow matches confirmed banking dwell time',
      })
    );
  });

  it('allows investigators to export the active case snapshot', async () => {
    render(<EvidenceReview />);

    const exportBtn = screen.getByText(/Export Active Case Snapshot/i);
    fireEvent.click(exportBtn);

    // Wait for async hash & export
    await vi.waitFor(() => {
      expect(downloadJsonMock).toHaveBeenCalledTimes(1);
    });

    expect(downloadJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'aegistrace-trace-snapshot',
        version: 1,
        integrity: expect.objectContaining({ algorithm: 'SHA-256' }),
      }),
      expect.stringContaining('aegistrace-trace-snapshot')
    );
  });
});
