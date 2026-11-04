import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SyndicateMap from './SyndicateMap';

const { handleSelectCase, scenarios } = vi.hoisted(() => ({ handleSelectCase: vi.fn(), scenarios: [] }));
const TXID = 'a'.repeat(64);

vi.mock('../hooks/useCase', () => ({
  useCase: () => ({
    scenarios,
    activeCaseId: 'case-a',
    handleSelectCase,
  }),
}));

describe('SyndicateMap joint transaction links', () => {
  afterEach(cleanup);

  beforeEach(() => {
    handleSelectCase.mockClear();
    scenarios.splice(0, scenarios.length,
      {
        id: 'case-a',
        title: 'Case A',
        nodes: [{ id: 'input-a', type: 'suspect', details: { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' } }],
        links: [],
        jointTransactionEvidence: [{ txid: TXID, inputAddresses: ['bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'] }],
      },
      {
        id: 'case-b',
        title: 'Case B',
        nodes: [{ id: 'input-b', type: 'suspect', details: { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' } }],
        links: [],
        jointTransactionEvidence: [{ txid: TXID, inputAddresses: ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'] }],
      },
    );
  });

  it('shows recorded co-spends as weak cross-case evidence', () => {
    render(<SyndicateMap />);

    expect(screen.getByText(/1 joint transaction/)).toBeDefined();
    expect(screen.getByText(/Weak overlap/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /show link evidence/i }));

    expect(screen.getByText(`Joint transaction · ${TXID}`)).toBeDefined();
    expect(screen.getByText(/does not establish common ownership or control/)).toBeDefined();
  });

  it('displays manual associations as unverified, separate from on-chain links', () => {
    const association = {
      associationId: 'manual-2',
      caseAId: 'case-a',
      caseBId: 'case-b',
      transactionIds: ['b'.repeat(64)],
      rationale: 'Investigator supplied context for review.',
      warning: 'Not independently verified.',
    };
    scenarios.splice(0, scenarios.length,
      { id: 'case-a', title: 'Case A', nodes: [], links: [], manualCaseAssociations: [association] },
      { id: 'case-b', title: 'Case B', nodes: [], links: [], manualCaseAssociations: [association] },
    );
    render(<SyndicateMap />);

    expect(screen.getByText(/Investigator-recorded association/)).toBeDefined();
    expect(screen.getByText(/1 manual association/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /show link evidence/i }));
    expect(screen.getByText('Rationale: Investigator supplied context for review.')).toBeDefined();
    expect(screen.getByText('Not independently verified.')).toBeDefined();
  });
});
