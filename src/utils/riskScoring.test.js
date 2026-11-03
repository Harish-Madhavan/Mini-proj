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
    expect(result.statutoryAction.urgency).toBe('PRIORITY_ANALYST_REVIEW');
    expect(result.statutoryAction.actionRequired).toBe(false);
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

  it('does not treat case-provided identity labels as verified for a risk discount', () => {
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

    const scoreUnverified = calculateForensicRiskScore(withoutKycNodes).riskScore;
    const scoreLabeledVerified = calculateForensicRiskScore(withKycNodes).riskScore;

    expect(scoreLabeledVerified).toBe(scoreUnverified);
  });

  it('withholds numeric risk and statutory recommendations when there are no qualifying signals', () => {
    const result = calculateForensicRiskScore([
      { id: 'origin', type: 'suspect' },
      { id: 'endpoint', type: 'receiver' },
    ]);
    expect(result.riskScore).toBeNull();
    expect(result.assessmentStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.threatBadge.level).toBe('UNASSESSED');
    expect(result.statutoryAction.actionRequired).toBe(false);
    expect(result.statutoryAction.urgency).toBe('NOT_ASSESSED');
  });

  it('does not score simulated or user-supplied cases as observed risk evidence', () => {
    for (const traceType of ['SIMULATED_ESTIMATE', 'MANUAL_HYPOTHESIS']) {
      const result = calculateForensicRiskScore({
        traceType,
        nodes: [{ id: 'hop', type: 'hop' }],
        links: [],
      });
      expect(result.riskScore).toBeNull();
      expect(result.assessmentStatus).not.toBe('ASSESSED');
    }
  });

  it('returns correct statutory legal actions based on score', () => {
    const criticalAction = getStatutoryLegalAction(85, false, false);
    expect(criticalAction.actionRequired).toBe(false);
    expect(criticalAction.urgency).toBe('PRIORITY_ANALYST_REVIEW');
    expect(criticalAction.recommendations.join(' ')).toContain('independent attribution evidence');

    const historicalAction = getStatutoryLegalAction(15, false, true);
    expect(historicalAction.actionRequired).toBe(false);
  });

  it('generates accurate threat badges for various score thresholds', () => {
    expect(getThreatBadge(20).level).toBe('LOW');
    expect(getThreatBadge(50).level).toBe('MEDIUM');
    expect(getThreatBadge(85).level).toBe('HIGH');
  });

  it('keeps score direction consistent when risk weights change', () => {
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
        weight: 'mixerWeight',
      },
      {
        name: 'historical',
        nodes: [
          { id: 'in_p2pk', type: 'suspect', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } },
          { id: 'out_p2pk', type: 'receiver', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } }
        ],
        weight: 'baseScore',
      },
      {
        name: 'single hop, no KYC',
        nodes: [
          { id: 'suspect', type: 'suspect' },
          { id: 'hop', type: 'hop' },
          { id: 'receiver', type: 'receiver', details: { kycStatus: 'UNREGISTERED' } }
        ],
        weight: 'hopWeight',
      },
    ];
    for (const c of cases) {
      const defaultScore = calculateForensicRiskScore(c.nodes).riskScore;
      const base = {
        mixerWeight: 35,
        hopWeight: 12,
        baseScore: 20,
      }[c.weight];
      const lower = calculateForensicRiskScore(c.nodes, { [c.weight]: base * 0.8 }).riskScore;
      const higher = calculateForensicRiskScore(c.nodes, { [c.weight]: base * 1.2 }).riskScore;
      expect(lower, c.name).toBeLessThanOrEqual(defaultScore);
      expect(higher, c.name).toBeGreaterThanOrEqual(defaultScore);
    }
  });

  it('identifies cross-chain bridge hops and elevates obfuscation risk score', () => {    const bridgeNodes = [
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
    expect(result.threatBadge.level).toBe('MEDIUM');
  });

  it('scores consolidation sweeps only when graph links show fan-in', () => {
    const nodes = [
      { id: 'hub', type: 'hop', details: { kycStatus: 'UNREGISTERED TRANSIT' } },
      { id: 'gov-out', type: 'receiver', balance: '5.99 BTC', details: { kycStatus: 'HOLDING FUNDS (UNSPENT)' } },
      { id: 'branch', type: 'hop', balance: '0.01 BTC', details: {} }
    ];
    const links = ['a', 'b', 'c', 'd', 'e', 'f'].map(s => ({ source: s, target: 'hub', value: '1.0 BTC' }));
    links.push({ source: 'hub', target: 'gov-out', value: '5.99 BTC' });
    links.push({ source: 'hub', target: 'branch', value: '0.01 BTC' });

    const withLinks = calculateForensicRiskScore({ nodes, links });
    expect(withLinks.hasSweep).toBe(true);
    expect(withLinks.dimensions.consolidationScore).toBe(8);
    expect(withLinks.threatSignatures.some(s => s.category === 'Sweep check')).toBe(true);

    // Node-only callers degrade to no sweep signal instead of crashing.
    const nodesOnly = calculateForensicRiskScore(nodes);
    expect(nodesOnly.hasSweep).toBe(false);
    expect(nodesOnly.dimensions.consolidationScore).toBe(0);
  });

  it('flags imminent sweep patterns for analyst review without directing a freeze', () => {
    const nodes = [
      { id: 'hub', type: 'hop', entityName: 'Exchange aggregator', details: { kycStatus: 'IDENTITY VERIFIED' } },
      { id: 'out', type: 'receiver', balance: '5.99 BTC', details: { kycStatus: 'UNREGISTERED' } }
    ];
    const links = ['a', 'b', 'c', 'd', 'e', 'f'].map(s => ({ source: s, target: 'hub', value: '1.0 BTC' }));
    links.push({ source: 'hub', target: 'out', value: '5.99 BTC' });

    const result = calculateForensicRiskScore({ nodes, links });
    expect(result.sweepImminent).toBe(true);
    expect(result.dimensions.consolidationScore).toBe(15);
    expect(result.statutoryAction.actionRequired).toBe(false);
    expect(result.statutoryAction.recommendations.some(r => r.includes('Review the consolidation pattern'))).toBe(true);
  });

  it('does not boost attribution based on short entity prefixes', () => {
    const sanctioned = calculateForensicRiskScore([
      { id: 'in_1L26zGarantexDeposit', type: 'hop', details: { address: '1L26zGarantexDepositWalletAddress' } },
      { id: 'out_x', type: 'receiver', details: { kycStatus: 'UNREGISTERED' } }
    ]);
    expect(sanctioned.dimensions.attributionScore).toBe(0);
    expect(sanctioned.entityHits.length).toBe(0);
    expect(sanctioned.threatSignatures.some(s => s.name === 'Sanctioned entity contact')).toBe(false);

    const seizure = calculateForensicRiskScore([
      { id: 'out_bc1qa5wksynth000001', type: 'receiver', details: { address: 'bc1qa5wksynthseizure000001', kycStatus: 'HOLDING FUNDS (UNSPENT)' } }
    ]);
    expect(seizure.dimensions.attributionScore).toBe(0);
    expect(seizure.entityHits.length).toBe(0);
  });

  it('holds historical cases at the era cap despite sweep links and old tags', () => {
    const nodes = [
      { id: 'in_p2pk', type: 'suspect', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } },
      { id: 'out_p2pk', type: 'receiver', details: { scriptStandard: 'P2PK', kycStatus: 'HISTORICAL UNSPENT UTXO' } }
    ];
    const links = ['a', 'b', 'c', 'd'].map(s => ({ source: s, target: 'in_p2pk', value: '1.0 BTC' }));
    const result = calculateForensicRiskScore({ nodes, links });
    expect(result.isHistoricalEra).toBe(true);
    expect(result.dimensions.consolidationScore).toBe(0);
    expect(result.dimensions.attributionScore).toBe(0);
    expect(result.riskScore).toBeLessThanOrEqual(25);
  });
});
