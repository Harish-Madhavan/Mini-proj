import { describe, it, expect } from 'vitest';
import {
  JUDICIAL_CASE_CANDIDATES,
  JUDICIAL_GROUND_TRUTH,
  TRACE_VALIDATION_CANDIDATES,
  queryJudicialGroundTruth,
} from '../data/judicialCorpus';
import { KNOWN_ENTITIES, tagKnownEntity } from './knownEntities';
import {
  evaluateGroundTruthBenchmark,
  evaluateTraceAgainstGroundTruth,
  validateGroundTruthCase,
} from './groundTruthEvaluation';

const TXID = 'a'.repeat(64);
const verifiedFixture = {
  id: 'reviewed-fixture',
  status: 'VERIFIED',
  review: {
    reviewer: 'test reviewer',
    reviewedAt: '2026-01-01',
    method: 'Cross-checked transaction output against the cited record.',
  },
  chainEvidence: [{
    txid: TXID,
    provider: 'Test source',
    retrievedAt: '2026-01-01T00:00:00.000Z',
    canonicalResponseSha256: `SHA256:${'A'.repeat(64)}`,
  }],
  sources: [{
    id: 'primary-record',
    title: 'Primary source',
    url: 'https://example.test/record.pdf',
    locator: 'Page 4, paragraph 12',
    primary: true,
  }],
  expectedOutputs: [
    { txid: TXID, outputIndex: 0, address: 'bc1qpayment', expectedRole: 'payment', sourceIds: ['primary-record'] },
    { txid: TXID, outputIndex: 1, address: 'bc1qchange', expectedRole: 'change', sourceIds: ['primary-record'] },
  ],
};

describe('ground-truth benchmark safeguards', () => {
  it('keeps research leads and legacy transaction references separate from verified labels', () => {
    expect(JUDICIAL_GROUND_TRUTH).toEqual([]);
    expect(JUDICIAL_CASE_CANDIDATES.length).toBeGreaterThan(0);
    expect(TRACE_VALIDATION_CANDIDATES.length).toBeGreaterThan(0);
    expect(TRACE_VALIDATION_CANDIDATES.every(entry =>
      entry.status === 'UNVERIFIED_REFERENCE' && entry.expectedOutputs.length === 0
    )).toBe(true);
    expect(queryJudicialGroundTruth('7acfa96e54f73abdafbfa241ec7e8d42d3869b3597d620584749f1db7eead98b')).toBeNull();
  });

  it('requires primary citations, exact output labels, and recorded review before benchmarking', () => {
    expect(validateGroundTruthCase(verifiedFixture).valid).toBe(true);
    expect(validateGroundTruthCase(TRACE_VALIDATION_CANDIDATES[0]).valid).toBe(false);
    expect(validateGroundTruthCase({
      ...verifiedFixture,
      sources: [{ title: 'Uncited', url: 'https://example.test', primary: false }],
    }).valid).toBe(false);
  });

  it('reports exact output coverage and payment/change agreement for reviewed cases', () => {
    const trace = {
      nodes: [
        { id: 'pay', type: 'receiver', details: { address: 'bc1qpayment' } },
        { id: 'change', type: 'change', details: { address: 'bc1qchange' } },
        { id: 'extra', type: 'receiver', details: { address: 'bc1qextra' } },
      ],
      links: [
        { source: `tx_${TXID}`, target: 'pay', txid: TXID, outputIndex: 0 },
        { source: `tx_${TXID}`, target: 'change', txid: TXID, outputIndex: 1 },
        { source: `tx_${TXID}`, target: 'extra', txid: TXID, outputIndex: 2 },
      ],
    };
    const result = evaluateTraceAgainstGroundTruth(trace, verifiedFixture);
    expect(result).toMatchObject({
      matchedOutputs: 2,
      expectedOutputs: 2,
      predictedOutputs: 3,
      precision: 2 / 3,
      recall: 1,
      classificationAccuracy: 1,
    });
  });

  it('reports no verified benchmark cases instead of a misleading perfect score', () => {
    expect(evaluateGroundTruthBenchmark()).toEqual({
      status: 'NO_VERIFIED_CASES',
      caseCount: 0,
      cases: [],
      aggregate: null,
    });
  });

  it('aggregates only source-backed reviewed cases', () => {
    const benchmark = evaluateGroundTruthBenchmark([verifiedFixture], {
      [verifiedFixture.id]: {
        nodes: [
          { id: 'pay', type: 'receiver', details: { address: 'bc1qpayment' } },
          { id: 'change', type: 'change', details: { address: 'bc1qchange' } },
        ],
        links: [
          { source: `tx_${TXID}`, target: 'pay', txid: TXID, outputIndex: 0 },
          { source: `tx_${TXID}`, target: 'change', txid: TXID, outputIndex: 1 },
        ],
      },
    });
    expect(benchmark.status).toBe('EVALUATED');
    expect(benchmark.caseCount).toBe(1);
    expect(benchmark.aggregate).toMatchObject({
      matchedOutputs: 2,
      expectedOutputs: 2,
      predictedOutputs: 2,
      precision: 1,
      recall: 1,
      classificationAccuracy: 1,
    });
  });

  it('refuses to score a candidate as ground truth', () => {
    expect(() => evaluateTraceAgainstGroundTruth({}, TRACE_VALIDATION_CANDIDATES[0]))
      .toThrow(/not benchmark-ready/);
  });

  it('keeps unsourced entity references out of attribution and risk scoring', () => {
    expect(KNOWN_ENTITIES.some(entity => entity.verified === true)).toBe(false);
    for (const entity of KNOWN_ENTITIES) {
      expect(['sanctioned', 'darknet', 'seizure', 'exchange']).not.toContain(tagKnownEntity(entity.pattern)?.category);
    }
  });

  it('does not infer sanctions or ownership from address prefixes', () => {
    expect(tagKnownEntity('1L26z9842109876543210987654321098765')).toBeNull();
    expect(tagKnownEntity('bc1qa5wkhsye2vftene9965ngxtxtjaentrpucexdw')).toBeNull();
    expect(tagKnownEntity('0x12D6' + 'a'.repeat(36))).toBeNull();
  });
});
