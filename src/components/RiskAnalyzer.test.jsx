import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RiskAnalyzer from './RiskAnalyzer';
import * as useCaseModule from '../hooks/useCase';
import * as useToastModule from '../hooks/useToast';
import * as downloadModule from '../utils/download';

vi.mock('../hooks/useCase');
vi.mock('../hooks/useToast');
vi.mock('../utils/download');

describe('RiskAnalyzer Component', () => {
  const showToastMock = vi.fn();
  const downloadTextMock = vi.fn();

  const mockCase = {
    id: 'test-case-01',
    title: 'Test Forensic Scenario',
    currency: 'BTC',
    nodes: [
      {
        id: 'node-suspect',
        type: 'suspect',
        balance: '5.0 BTC',
        details: { kycStatus: 'NON_KYC', rbfStatus: 'Replaceable fee' }
      },
      {
        id: 'node-hop',
        type: 'hop',
        balance: '4.8 BTC',
        details: { kycStatus: 'UNVERIFIED' }
      },
      {
        id: 'node-mixer',
        type: 'mixer',
        balance: '4.5 BTC',
        details: { kycStatus: 'WASABI_COINJOIN' }
      },
      {
        id: 'node-receiver',
        type: 'receiver',
        balance: '4.2 BTC',
        details: { kycStatus: 'UNVERIFIED' }
      }
    ],
    links: [
      { source: 'node-suspect', target: 'node-hop', value: '5.0 BTC' },
      { source: 'node-hop', target: 'node-mixer', value: '4.8 BTC' },
      { source: 'node-mixer', target: 'node-receiver', value: '4.2 BTC' }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useToastModule.useToast.mockReturnValue({ showToast: showToastMock });
    downloadModule.downloadText.mockImplementation(downloadTextMock);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders "Select a case first." when no active case is available', () => {
    useCaseModule.useCase.mockReturnValue({ activeCase: null });
    render(<RiskAnalyzer />);
    expect(screen.getByText('Select a case first.')).toBeDefined();
  });

  it('renders all 5 forensic dimensional meters', () => {
    useCaseModule.useCase.mockReturnValue({ activeCase: mockCase });
    render(<RiskAnalyzer />);

    expect(screen.getByText('Risk analysis')).toBeDefined();
    expect(screen.getByText('Mixer risk')).toBeDefined();
    expect(screen.getAllByText('Splits').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Destination')).toBeDefined();
    expect(screen.getByText('Velocity')).toBeDefined();
    expect(screen.getByText('Protocol / RBF')).toBeDefined();
  });

  it('toggles weights adjustment slider configuration panel', () => {
    useCaseModule.useCase.mockReturnValue({ activeCase: mockCase });
    render(<RiskAnalyzer />);

    const adjustBtn = screen.getByRole('button', { name: /adjust weights/i });
    expect(screen.queryByText(/mixer weight/i)).toBeNull();

    fireEvent.click(adjustBtn);
    expect(screen.getByText(/hide weights/i)).toBeDefined();
    expect(screen.getByText(/mixer weight/i)).toBeDefined();
    expect(screen.getByText(/split weight/i)).toBeDefined();
    expect(screen.getByText(/identity discount/i)).toBeDefined();
  });

  it('exports formatted risk dossier when Dossier button is clicked', () => {
    useCaseModule.useCase.mockReturnValue({ activeCase: mockCase });
    render(<RiskAnalyzer />);

    const dossierBtn = screen.getByRole('button', { name: /dossier/i });
    fireEvent.click(dossierBtn);

    expect(downloadTextMock).toHaveBeenCalled();
    const [content, filename] = downloadTextMock.mock.calls[0];
    expect(filename).toContain('NCB-Risk-Dossier-TEST-CASE-01.txt');
    expect(content).toContain('BLOCKCHAIN FORENSIC RISK DOSSIER');
    expect(content).toContain('Protocol anomaly');
    expect(showToastMock).toHaveBeenCalledWith('Risk report downloaded.', 'success');
  });
});
