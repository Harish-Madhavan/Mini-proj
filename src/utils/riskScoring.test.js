import { describe, it, expect } from 'vitest';
import { 
  calculateForensicRiskScore, 
  getThreatBadge, 
  getStatutoryLegalAction 
} from './riskScoring';

describe('riskScoring engine', () => {
  it('assigns high risk score to cases containing mixers and multiple hops', () => {
    const highRiskNodes = [
      { id: 'suspect', type: 'suspect' },
      { id: 'mixer', type: 'mixer' },
      { id: 'hop1', type: 'hop' },
      { id: 'hop2', type: 'hop' },
      { id: 'receiver', type: 'receiver', details: { kycStatus: 'UNREGISTERED' } }
    ];

    const result = calculateForensicRiskScore(highRiskNodes);
    expect(result.riskScore).toBeGreaterThanOrEqual(70);
    expect(result.hasMixer).toBe(true);
    expect(result.threatBadge.level).toBe('HIGH');
    expect(result.statutoryAction.urgency).toBe('CRITICAL_ACTION_REQUIRED');
  });

  it('assigns clean/low score to historical Satoshi-era P2P transactions', () => {
    const historicalNodes = [
      { id: 'in_p2pk', type: 'suspect', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } },
      { id: 'out_p2pk', type: 'receiver', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } }
    ];

    const result = calculateForensicRiskScore(historicalNodes);
    expect(result.isHistoricalEra).toBe(true);
    expect(result.riskScore).toBeLessThan(35);
    expect(result.threatBadge.level).toBe('LOW');
  });

  it('applies KYC discount when destination resolves to regulated exchange', () => {
    const withoutKycNodes = [
      { id: 'suspect', type: 'suspect' },
      { id: 'hop', type: 'hop' },
      { id: 'receiver', type: 'receiver', details: { kycStatus: 'UNREGISTERED' } }
    ];
    const withKycNodes = [
      { id: 'suspect', type: 'suspect' },
      { id: 'hop', type: 'hop' },
      { id: 'receiver', type: 'receiver', details: { kycStatus: 'KYC VERIFIED' } }
    ];

    const scoreNoKyc = calculateForensicRiskScore(withoutKycNodes).riskScore;
    const scoreKyc = calculateForensicRiskScore(withKycNodes).riskScore;

    expect(scoreKyc).toBeLessThan(scoreNoKyc);
  });

  it('returns correct statutory legal actions based on score', () => {
    const criticalAction = getStatutoryLegalAction(85, false, false);
    expect(criticalAction.actionRequired).toBe(true);
    expect(criticalAction.urgency).toBe('CRITICAL_ACTION_REQUIRED');
    expect(criticalAction.recommendations[0]).toContain('Section 67 NDPS Act');

    const historicalAction = getStatutoryLegalAction(15, false, true);
    expect(historicalAction.actionRequired).toBe(false);
  });

  it('generates accurate threat badges for various score thresholds', () => {
    expect(getThreatBadge(20).level).toBe('LOW');
    expect(getThreatBadge(50).level).toBe('MEDIUM');
    expect(getThreatBadge(85).level).toBe('HIGH');
  });
});
