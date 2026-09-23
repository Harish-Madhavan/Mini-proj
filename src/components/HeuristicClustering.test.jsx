import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import HeuristicClustering from './HeuristicClustering';
import * as useCaseModule from '../hooks/useCase';
import * as useToastModule from '../hooks/useToast';

vi.mock('../hooks/useCase');
vi.mock('../hooks/useToast');
vi.mock('../utils/bitcoinApi', () => ({
  fetchAddressTxs: vi.fn().mockResolvedValue([]),
  fetchTx: vi.fn().mockResolvedValue({}),
}));

describe('HeuristicClustering Component', () => {
  const showToastMock = vi.fn();

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
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders default suspect addresses and action controls', () => {
    render(<HeuristicClustering />);
    expect(screen.getByText(/Shared spending/i)).toBeDefined();
    expect(screen.getByText('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBeDefined();
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
    const removeButtons = screen.getAllByTitle('Remove address');
    const initialCount = removeButtons.length;

    fireEvent.click(removeButtons[0]);
    expect(screen.getAllByTitle('Remove address').length).toBe(initialCount - 1);
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
});
