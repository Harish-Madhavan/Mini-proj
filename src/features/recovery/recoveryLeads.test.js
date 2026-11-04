import { describe, expect, it } from 'vitest';
import {
  RECOVERY_ACTION_STATES,
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
