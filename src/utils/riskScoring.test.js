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

  it('applies identity discount when destination resolves to regulated exchange', () => {
    const withoutKycNodes = [
      { id: 'suspect', type: 'suspect' },
      { id: 'hop', type: 'hop' },
      { id: 'receiver', type: 'receiver', details: { kycStatus: 'UNREGISTERED' } }
    ];
    const withKycNodes = [
      { id: 'suspect', type: 'suspect' },
      { id: 'hop', type: 'hop' },
      { id: 'receiver', type: 'receiver', details: { kycStatus: 'IDENTITY VERIFIED' } }
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

  it('keeps threat bands stable under ±20% weight changes', () => {
    // Risk weights are judgment calls. Verdicts must not hinge on their exact
    // values — perturb each weight and require the same band.
    const cases = [
      {
        name: 'mixer + hops',
        nodes: [
          { id: 'suspect', type: 'suspect' },
          { id: 'mixer', type: 'mixer' },
          { id: 'hop1', type: 'hop' },
          { id: 'hop2', type: 'hop' },
          { id: 'receiver', type: 'receiver', details: { kycStatus: 'UNREGISTERED' } }
        ],
        band: 'HIGH',
      },
      {
        name: 'historical',
        nodes: [
          { id: 'in_p2pk', type: 'suspect', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } },
          { id: 'out_p2pk', type: 'receiver', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } }
        ],
        band: 'LOW',
      },
      {
        name: 'single hop, no KYC',
        nodes: [
          { id: 'suspect', type: 'suspect' },
          { id: 'hop', type: 'hop' },
          { id: 'receiver', type: 'receiver', details: { kycStatus: 'UNREGISTERED' } }
        ],
        band: 'MEDIUM',
      },
    ];
    const perturbations = [
      { mixerWeight: 28 }, { mixerWeight: 42 },
      { hopWeight: 9.6 }, { hopWeight: 14.4 },
      { kycDiscountWeight: 12 }, { kycDiscountWeight: 18 },
      { baseScore: 16 }, { baseScore: 24 },
    ];
    for (const c of cases) {
      expect(calculateForensicRiskScore(c.nodes).threatBadge.level, c.name).toBe(c.band);
      for (const weights of perturbations) {
        expect(
          calculateForensicRiskScore(c.nodes, weights).threatBadge.level,
          `${c.name} with ${JSON.stringify(weights)}`
        ).toBe(c.band);
      }
    }
  });

  it('identifies cross-chain bridge hops and elevates obfuscation risk score', () => {
    const bridgeNodes = [
      { id: 'suspect', type: 'suspect', balance: '3.0 BTC' },
      { id: 'hop1', type: 'hop', balance: '2.99 BTC' },
      { 
        id: 'bridge', 
        type: 'bridge', 
        label: 'THORChain Asgard Vault', 
        balance: '2.95 BTC',
        details: { 
          address: 'bc1qthorvault9981247asgard001',
          opReturnDecoded: 'SWAP:ETH.USDT:0x71C8364437F5Fa0128509890F0D8E8170D30d6F9:1000'
        } 
      }
    ];

    const result = calculateForensicRiskScore(bridgeNodes);
    expect(result.hasBridge).toBe(true);
    expect(result.dimensions.obfuscationScore).toBeGreaterThan(0);
    expect(result.threatSignatures.some(s => s.name === 'Cross-chain bridge exit')).toBe(true);
    expect(result.threatBadge.level).toBe('HIGH');
  });
});
