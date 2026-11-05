import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AssetRecovery from './AssetRecovery';
import * as useCaseModule from '../../hooks/useCase';

vi.mock('../../hooks/useCase');

describe('AssetRecovery UI Component', () => {
  const addRecoveryActionMock = vi.fn();
  const updateRecoveryActionMock = vi.fn();
  const updateRecoveryLeadMetadataMock = vi.fn();

  afterEach(() => {
    cleanup();
  });

  const mockCase = {
    id: 'case_test_recovery_01',
    name: 'Narcotics Operation Falcon',
    currency: 'BTC',
    nodes: [
      { id: 'suspect_wallet', type: 'suspect', balance: '5.0' },
      {
        id: 'terminal_exchange_wallet',
        type: 'wallet',
        balance: '2.5',
        details: {
          address: 'bc1qterminalexchange999',
          outspendSpent: false,
          destinationEvidence: {
            verified: true,
            type: 'Exchange Deposit',
            source: 'FIU-India Verified VDA Registry',
          },
          attributionEvidence: {
            verified: true,
            source: 'Law Enforcement Disclosure',
            confidence: 0.9,
          },
          verifiedContact: {
            verified: true,
            source: 'Exchange Compliance Desk',
            verifiedAt: '2026-10-01T00:00:00.000Z',
          },
        },
      },
    ],
    links: [
      {
        source: 'suspect_wallet',
        target: 'terminal_exchange_wallet',
        value: '2.5',
        txid: 'tx_final_hop_123',
        blockHeight: 850100,
        blockTime: 1730000000,
      },
    ],
    recoveryLeads: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useCaseModule, 'useCase').mockReturnValue({
      activeCase: mockCase,
      scenarios: [mockCase],
      addRecoveryAction: addRecoveryActionMock,
      updateRecoveryAction: updateRecoveryActionMock,
      updateRecoveryLeadMetadata: updateRecoveryLeadMetadataMock,
    });
  });

  it('renders header, global KPI metrics, and evidentiary banner', () => {
    render(<AssetRecovery />);

    expect(screen.getByText('Asset Recovery Workstation')).toBeDefined();
    expect(screen.getByText(/Total Attributed Taint/i)).toBeDefined();
    expect(screen.getByText(/Recoverable Unspent/i)).toBeDefined();
    expect(screen.getByText(/Evidentiary Safeguard/i)).toBeDefined();
    expect(screen.getByText('bc1qterminalexchange999')).toBeDefined();
    expect(screen.getByText('Exchange Deposit')).toBeDefined();
    expect(screen.getByText(/Sourced Verification/i)).toBeDefined();
    expect(screen.getByText(/UTXO Unspent/i)).toBeDefined();
  });

  it('filters leads by search query and shows empty state when no match', () => {
    render(<AssetRecovery />);

    const searchInput = screen.getByLabelText('Filter recovery leads by search term');
    fireEvent.change(searchInput, { target: { value: 'non_existent_address' } });

    expect(screen.getByText('No Matching Recovery Leads')).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'bc1qterminal' } });
    expect(screen.getByText('bc1qterminalexchange999')).toBeDefined();
  });

  it('allows investigators to record follow-up actions', () => {
    render(<AssetRecovery />);

    const actionEvidenceInput = screen.getByLabelText(/Action evidence for Exchange Deposit/i);
    fireEvent.change(actionEvidenceInput, { target: { value: 'Emergency freeze order SEC91-2026' } });

    const addActionBtn = screen.getByText('Add Action');
    fireEvent.click(addActionBtn);

    expect(addRecoveryActionMock).toHaveBeenCalledTimes(1);
    expect(addRecoveryActionMock).toHaveBeenCalledWith(
      'lead_bc1qterminalexchange999',
      expect.objectContaining({
        evidence: 'Emergency freeze order SEC91-2026',
        type: 'Prepare preservation request',
        state: 'planned',
      })
    );
  });

  it('allows investigators to log lead review notes', () => {
    render(<AssetRecovery />);

    const reviewInput = screen.getByLabelText(/Lead review note for Exchange Deposit/i);
    fireEvent.change(reviewInput, { target: { value: 'Reviewed by Inspector Sharma on 05 Nov' } });

    const markReviewedBtn = screen.getByText('Mark Lead Reviewed');
    fireEvent.click(markReviewedBtn);

    expect(updateRecoveryLeadMetadataMock).toHaveBeenCalledTimes(1);
    expect(updateRecoveryLeadMetadataMock).toHaveBeenCalledWith(
      'lead_bc1qterminalexchange999',
      expect.objectContaining({
        reviewNote: 'Reviewed by Inspector Sharma on 05 Nov',
      })
    );
  });
});
