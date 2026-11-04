import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SyndicateMap from './SyndicateMap';

const { handleSelectCase } = vi.hoisted(() => ({ handleSelectCase: vi.fn() }));
const TXID = 'a'.repeat(64);

vi.mock('../hooks/useCase', () => ({
  useCase: () => ({
    scenarios: [
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
    ],
    activeCaseId: 'case-a',
    handleSelectCase,
  }),
}));

describe('SyndicateMap joint transaction links', () => {
  beforeEach(() => handleSelectCase.mockClear());

  it('shows recorded co-spends as weak cross-case evidence', () => {
    render(<SyndicateMap />);

    expect(screen.getByText(/1 joint transaction/)).toBeDefined();
    expect(screen.getByText(/Weak overlap/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /show link evidence/i }));

    expect(screen.getByText(`Joint transaction · ${TXID}`)).toBeDefined();
    expect(screen.getByText(/does not establish common ownership or control/)).toBeDefined();
  });
});
