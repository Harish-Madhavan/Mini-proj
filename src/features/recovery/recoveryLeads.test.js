import { describe, expect, it } from 'vitest';
import {
  RECOVERY_ACTION_STATES,
  RecoveryPriorityQueue,
  buildRecoveryLeads,
  formatLeadAmount,
  getRecoveryActionTransitions,
  transitionRecoveryAction,
  updateRecoveryActionRecord,
} from './recoveryLeads';

describe('recovery action history', () => {
  const action = {
    id: 'action-1',
    state: RECOVERY_ACTION_STATES.PLANNED,
    evidence: 'Initial case note',
    nextFollowUpAt: null,
    history: [],
  };

  it('records supporting evidence and deadline edits in action history', () => {
    const result = updateRecoveryActionRecord(action, {
      evidence: 'Preservation request reference PR-123',
      nextFollowUpAt: '2026-11-10T23:59:59.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.action).toMatchObject({
      evidence: 'Preservation request reference PR-123',
      nextFollowUpAt: '2026-11-10T23:59:59.000Z',
    });
    expect(result.action.history).toHaveLength(1);
    expect(result.action.history[0]).toMatchObject({
      event: 'details_updated',
      state: RECOVERY_ACTION_STATES.PLANNED,
      changes: ['evidence', 'nextFollowUpAt'],
      evidence: 'Preservation request reference PR-123',
    });
    expect(action.history).toEqual([]);
  });

  it('rejects invalid date and unsupported field edits without changing the action', () => {
    expect(updateRecoveryActionRecord(action, { nextFollowUpAt: 'not-a-date' }).ok).toBe(false);
    expect(updateRecoveryActionRecord(action, { state: '' }).ok).toBe(false);
    expect(updateRecoveryActionRecord(action, { owner: 'someone' }).ok).toBe(false);
    expect(action.history).toEqual([]);
  });

  it('keeps state changes on the allowed transition path and requires recovery evidence', () => {
    const invalid = updateRecoveryActionRecord(action, { state: RECOVERY_ACTION_STATES.AWAITING_RESPONSE });
    expect(invalid.ok).toBe(false);

    const submitted = updateRecoveryActionRecord(action, { state: RECOVERY_ACTION_STATES.SUBMITTED });
    expect(submitted).toMatchObject({ ok: true, action: { state: RECOVERY_ACTION_STATES.SUBMITTED } });

    const confirmedWithoutEvidence = transitionRecoveryAction(
      { ...submitted.action, state: RECOVERY_ACTION_STATES.AWAITING_RESPONSE },
      RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED
    );
    expect(confirmedWithoutEvidence).toMatchObject({
      ok: false,
      error: 'Confirmed recovery requires supporting outcome evidence.',
    });
  });
});

describe('RecoveryPriorityQueue', () => {
  it('dequeues items in descending priority order', () => {
    const pq = new RecoveryPriorityQueue();
    pq.enqueue({ id: 'low' }, 20);
    pq.enqueue({ id: 'high' }, 90);
    pq.enqueue({ id: 'med' }, 50);

    expect(pq.dequeue().id).toBe('high');
    expect(pq.dequeue().id).toBe('med');
    expect(pq.dequeue().id).toBe('low');
    expect(pq.dequeue()).toBeNull();
  });
});

describe('buildRecoveryLeads forensic flow analysis & ranking', () => {
  const fixedNow = 1730800000000;
  const oneDayAgo = (fixedNow - 86400000) / 1000;
  const sixtyDaysAgo = (fixedNow - 60 * 86400000) / 1000;

  it('distinguishes attributed illicit sats from gross moved volume and captures last transaction', () => {
    const caseData = {
      nodes: [
        { id: 'suspect_root', type: 'suspect', balance: '1.0' },
        { id: 'intermediate_hop', type: 'wallet', balance: '0.0' },
        {
          id: 'destination_term',
          type: 'wallet',
          balance: '0.5',
          details: {
            address: 'bc1qdestinationterminal001',
            outspendSpent: false,
          },
        },
      ],
      links: [
        {
          source: 'suspect_root',
          target: 'intermediate_hop',
          value: '1.0',
          txid: 'tx_hop_1',
          blockHeight: 850000,
          blockTime: oneDayAgo,
        },
        {
          source: 'intermediate_hop',
          target: 'destination_term',
          value: '0.5',
          txid: 'tx_final_hop',
          blockHeight: 850010,
          blockTime: oneDayAgo,
        },
      ],
    };

    const leads = buildRecoveryLeads(caseData, fixedNow);
    expect(leads).toHaveLength(1);

    const lead = leads[0];
    expect(lead.address).toBe('bc1qdestinationterminal001');
    expect(lead.attributedSats).toBe(50000000);
    expect(lead.movedSats).toBe(50000000);
    expect(lead.availableSats).toBe(50000000);
    expect(lead.recoverability).toBe('unspent_confirmed');
    expect(lead.lastTransactionId).toBe('tx_final_hop');
    expect(lead.lastObservedAgeDays).toBeCloseTo(1, 1);
    expect(lead.freshness).toBe('current');
  });

  it('does not imply entity identity from heuristics, establishing destination type only from reliable evidence', () => {
    const caseData = {
      nodes: [
        { id: 'suspect_node', type: 'suspect', balance: '1.0' },
        {
          id: 'unverified_dest',
          type: 'wallet',
          balance: '0.3',
          details: {
            address: 'bc1qunverifieddestination',
            outspendSpent: false,
          },
        },
        {
          id: 'verified_exchange_dest',
          type: 'wallet',
          balance: '10.0',
          details: {
            address: 'bc1qverifiedexchangedeposit',
            outspendSpent: false,
            destinationEvidence: {
              verified: true,
              type: 'Exchange Deposit',
              source: 'FIU-India Verified Entity Registry',
            },
            attributionEvidence: {
              verified: true,
              source: 'Official LE Disclosure',
              confidence: 0.95,
            },
            verifiedContact: {
              verified: true,
              source: 'Exchange Legal Operations Desk',
              verifiedAt: new Date(fixedNow - 10 * 86400000).toISOString(),
            },
          },
        },
      ],
      links: [
        {
          source: 'suspect_node',
          target: 'unverified_dest',
          value: '0.3',
          txid: 'tx_unverified',
          blockHeight: 850020,
          blockTime: sixtyDaysAgo,
        },
        {
          source: 'suspect_node',
          target: 'verified_exchange_dest',
          value: '10.0',
          txid: 'tx_verified',
          blockHeight: 850025,
          blockTime: oneDayAgo,
        },
      ],
    };

    const leads = buildRecoveryLeads(caseData, fixedNow);
    expect(leads).toHaveLength(2);

    const verifiedLead = leads.find(l => l.address === 'bc1qverifiedexchangedeposit');
    const unverifiedLead = leads.find(l => l.address === 'bc1qunverifieddestination');

    expect(verifiedLead.destinationType).toBe('Exchange Deposit');
    expect(verifiedLead.label).toBe('Exchange Deposit');
    expect(verifiedLead.destinationEvidence.source).toBe('FIU-India Verified Entity Registry');
    expect(verifiedLead.verifiedContact).not.toBeNull();
    expect(verifiedLead.contactFreshness).toBe('current');

    expect(unverifiedLead.destinationType).toBe('Unknown');
    expect(unverifiedLead.label).toBe('Unclassified destination');
    expect(unverifiedLead.destinationEvidence).toBeNull();
    expect(unverifiedLead.verifiedContact).toBeNull();

    expect(leads[0].address).toBe('bc1qverifiedexchangedeposit');
    expect(verifiedLead.rankScore).toBeGreaterThan(unverifiedLead.rankScore);
    expect(verifiedLead.priority).toBe('High');
  });

  it('boosts scheduling score for overdue and due soon follow-up actions', () => {
    const address = 'bc1qfollowuptarget';
    const caseData = {
      nodes: [
        { id: 'suspect', type: 'suspect', balance: '1.0' },
        {
          id: 'target',
          type: 'wallet',
          balance: '0.5',
          details: { address, outspendSpent: false },
        },
      ],
      links: [
        {
          source: 'suspect',
          target: 'target',
          value: '0.5',
          txid: 'tx_123',
          blockHeight: 850000,
          blockTime: oneDayAgo,
        },
      ],
      recoveryLeads: [
        {
          id: `lead_${encodeURIComponent(address)}`,
          actions: [
            {
              id: 'act_1',
              type: 'Prepare preservation request',
              state: RECOVERY_ACTION_STATES.SUBMITTED,
              nextFollowUpAt: new Date(fixedNow - 2 * 86400000).toISOString(),
              createdAt: new Date(fixedNow - 5 * 86400000).toISOString(),
            },
          ],
        },
      ],
    };

    const leads = buildRecoveryLeads(caseData, fixedNow);
    expect(leads[0].followUpUrgency).toBe('overdue');
    expect(leads[0].schedulingScore).toBe(leads[0].rankScore + 15);
  });

  it('excludes intermediate hops and only includes terminal destinations', () => {
    const caseData = {
      nodes: [
        { id: 'root', type: 'suspect', balance: '2.0' },
        { id: 'hop1', type: 'wallet', balance: '0.0' },
        { id: 'hop2', type: 'wallet', balance: '0.0' },
        { id: 'terminal', type: 'wallet', balance: '1.0', details: { address: 'bc1qterm', outspendSpent: false } },
      ],
      links: [
        { source: 'root', target: 'hop1', value: '2.0', txid: 't1', blockHeight: 100 },
        { source: 'hop1', target: 'hop2', value: '1.5', txid: 't2', blockHeight: 101 },
        { source: 'hop2', target: 'terminal', value: '1.0', txid: 't3', blockHeight: 102 },
      ],
    };

    const leads = buildRecoveryLeads(caseData, fixedNow);
    expect(leads).toHaveLength(1);
    expect(leads[0].address).toBe('bc1qterm');
  });

  it('formats lead amounts with default and custom currencies', () => {
    expect(formatLeadAmount(150000000, 'BTC')).toBe('1.5000 BTC');
    expect(formatLeadAmount(50000, 'BTC')).toBe('0.0005 BTC');
  });

  it('returns valid state transitions for any given recovery action', () => {
    expect(getRecoveryActionTransitions({ state: RECOVERY_ACTION_STATES.PLANNED })).toEqual([
      'preparing',
      'submitted',
      'unable_to_proceed',
    ]);
    expect(getRecoveryActionTransitions({ state: RECOVERY_ACTION_STATES.SUBMITTED })).toEqual([
      'awaiting_response',
      'completed',
      'unable_to_proceed',
      'recovery_confirmed',
    ]);
    expect(getRecoveryActionTransitions({ state: RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED })).toEqual([]);
  });
});
