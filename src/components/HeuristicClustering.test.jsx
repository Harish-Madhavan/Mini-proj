import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import HeuristicClustering from './HeuristicClustering';
import * as useCaseModule from '../hooks/useCase';
import * as useToastModule from '../hooks/useToast';
import { fetchAddressTxs } from '../services/blockchain/gateway';

vi.mock('../hooks/useCase');
vi.mock('../hooks/useToast');
vi.mock('../services/blockchain/gateway', () => ({
  fetchAddressTxs: vi.fn().mockResolvedValue([]),
  fetchTx: vi.fn().mockResolvedValue({}),
}));
vi.mock('../utils/bitcoinApi', () => ({
  fetchAddressTxs: vi.fn().mockResolvedValue([]),
  fetchTx: vi.fn().mockResolvedValue({}),
}));

describe('HeuristicClustering Component', () => {
  const showToastMock = vi.fn();
  const importedCase = {
    id: 'case-import',
    title: 'Imported Case',
    nodes: [{ id: 'import-address', details: { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' } }]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useToastModule.useToast.mockReturnValue({ showToast: showToastMock });
    useCaseModule.useCase.mockReturnValue({
      activeCase: {
        id: 'case-test',
        title: 'Test Case',
        nodes: [
          { id: 'addr1', details: { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' } },
          { id: 'tx_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' }
        ]
      },
      scenarios: [
        { id: 'case-test', title: 'Test Case', nodes: [] },
        importedCase,
      ],
      handleRecordJointTransaction: vi.fn(),
      handleRecordManualCaseAssociation: vi.fn().mockReturnValue(true),
      setActiveTab: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('starts with an empty address list and action controls', () => {
    render(<HeuristicClustering />);
    expect(screen.getByText(/Shared spending/i)).toBeDefined();
    expect(screen.getByText(/Add 2 or more addresses/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /find groups/i })).toBeDefined();
  });

  it('allows adding a valid Bitcoin address and shows toast', () => {
    render(<HeuristicClustering />);
    const input = screen.getByPlaceholderText(/Enter a Bitcoin address/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    fireEvent.change(input, { target: { value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' } });
    fireEvent.click(addButton);

    expect(screen.getByText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBeDefined();
    expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('Added Legacy (P2PKH) address'), 'info');
  });

  it('handles address deletion', () => {
    render(<HeuristicClustering />);
    const input = screen.getByPlaceholderText(/Enter a Bitcoin address/i);
    fireEvent.change(input, { target: { value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    const removeButtons = screen.getAllByTitle('Remove address');
    const initialCount = removeButtons.length;

    fireEvent.click(removeButtons[0]);
    expect(screen.queryAllByTitle('Remove address').length).toBe(initialCount - 1);
    expect(showToastMock).toHaveBeenCalledWith('Address removed.', 'info');
  });

  it('flags EVM cross-chain addresses gracefully', () => {
    render(<HeuristicClustering />);
    const input = screen.getByPlaceholderText(/Enter a Bitcoin address/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    const ethAddr = '0x111111125421ca6dc452d289314280a0f8842a65';
    fireEvent.change(input, { target: { value: ethAddr } });
    fireEvent.click(addButton);

    expect(screen.getByText(ethAddr)).toBeDefined();
    expect(screen.getByText(/EVM address \(cross-chain\)/i)).toBeDefined();
  });

  it('imports valid Bitcoin addresses from another saved case', () => {
    render(<HeuristicClustering />);
    fireEvent.change(screen.getByRole('combobox', { name: /choose another case/i }), {
      target: { value: 'case-import' }
    });
    fireEvent.click(screen.getByRole('button', { name: /add case/i }));

    expect(screen.getByText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBeDefined();
    expect(showToastMock).toHaveBeenCalledWith(
      'Imported 1 new address(es) from "Imported Case".',
      'success'
    );
  });

  it('records a rationale-backed manual association for selected cases', async () => {
    const txid = 'c'.repeat(64);
    fetchAddressTxs.mockResolvedValue([{
      txid,
      vin: [
        { prevout: { scriptpubkey_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' } },
        { prevout: { scriptpubkey_address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' } },
      ],
      vout: [{ value: 100000000 }],
    }]);
    const caseValue = useCaseModule.useCase();
    render(<HeuristicClustering />);

    const addressInput = screen.getByPlaceholderText(/Enter a Bitcoin address/i);
    for (const address of [
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    ]) {
      fireEvent.change(addressInput, { target: { value: address } });
      fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    }
    fireEvent.click(screen.getByRole('button', { name: /find groups/i }));

    await waitFor(() => expect(screen.getByText('Add an investigator-reviewed case association')).toBeDefined());
    fireEvent.change(screen.getByRole('textbox', { name: /transaction references/i }), { target: { value: `${txid}\n${'d'.repeat(64)}` } });
    fireEvent.change(screen.getByRole('textbox', { name: /manual association rationale/i }), { target: { value: 'Reviewed two transaction references as part of this investigation.' } });
    fireEvent.click(screen.getByRole('button', { name: /save manual association/i }));

    expect(caseValue.handleRecordManualCaseAssociation).toHaveBeenCalledWith({
      caseAId: 'case-test',
      caseBId: 'case-import',
      transactionIds: [txid, 'd'.repeat(64)],
      rationale: 'Reviewed two transaction references as part of this investigation.',
    });
  });
});
