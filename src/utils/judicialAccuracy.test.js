import { describe, it, expect, vi } from 'vitest';
import {
  BITCOIN_COM_NOTABLE_ADDRESSES,
  JUDICIAL_CASE_CANDIDATES,
  JUDICIAL_GROUND_TRUTH,
  TRACE_VALIDATION_CANDIDATES,
  TRACE_BENCHMARK_CASES,
  queryJudicialGroundTruth,
} from '../data/judicialCorpus';
import { KNOWN_ENTITIES, tagKnownEntity } from './knownEntities';
import {
  evaluateGroundTruthBenchmark,
  evaluateTraceAgainstGroundTruth,
  validateGroundTruthCase,
} from './groundTruthEvaluation';
import { traceEndReceiver } from '../services/blockchain/tracing';
import { clearCache } from '../services/blockchain/gateway';

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
    type: 'primary_record',
    labelBasis: 'The cited primary record states these exact output roles.',
    title: 'Primary source',
    url: 'https://example.test/record.pdf',
    locator: 'Page 4, paragraph 12',
    primary: true,
  }],
  expectedOutputs: [
    { txid: TXID, outputIndex: 0, address: 'bc1qpayment', expectedRole: 'payment', expectedNodeRole: 'payee', sourceIds: ['primary-record'] },
    { txid: TXID, outputIndex: 1, address: 'bc1qchange', expectedRole: 'change', expectedNodeRole: 'change', sourceIds: ['primary-record'] },
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
    expect(BITCOIN_COM_NOTABLE_ADDRESSES.map(entry => entry.address)).toEqual([
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      '1Q2TWHE3GMdB6BZKafqwxXtWAWgFt5Jvm3',
      '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S',
    ]);
    expect(TRACE_BENCHMARK_CASES).toHaveLength(1);
    expect(TRACE_BENCHMARK_CASES[0].status).toBe('SOURCE_CORROBORATED');
    expect(queryJudicialGroundTruth('7acfa96e54f73abdafbfa241ec7e8d42d3869b3597d620584749f1db7eead98b')).toBeNull();
  });

  it('requires cited label sources, on-chain provenance, exact outputs, and recorded review', () => {
    expect(validateGroundTruthCase(verifiedFixture).valid).toBe(true);
    expect(validateGroundTruthCase(TRACE_VALIDATION_CANDIDATES[0]).valid).toBe(false);
    expect(validateGroundTruthCase({
      ...verifiedFixture,
      expectedOutputs: verifiedFixture.expectedOutputs.map(output => {
        const outputWithoutNodeRole = { ...output };
        delete outputWithoutNodeRole.expectedNodeRole;
        return outputWithoutNodeRole;
      }),
    }).valid).toBe(false);
    expect(validateGroundTruthCase({
      ...verifiedFixture,
      sources: [{
        id: 'secondary',
        type: 'secondary_explorer',
        title: 'Uncited',
        url: 'https://example.test',
        locator: 'A page',
        labelBasis: 'A claim',
        primary: false,
      }],
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
        { source: `tx_${TXID}`, target: 'pay', txid: TXID, outputIndex: 0, value: '1 BTC' },
        { source: `tx_${TXID}`, target: 'change', txid: TXID, outputIndex: 1, value: '2 BTC' },
        { source: `tx_${TXID}`, target: 'extra', txid: TXID, outputIndex: 2, value: '0.1 BTC' },
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
      nodeRoleAccuracy: 1,
      nodeRoleCoverage: 1,
    });
    expect(result.nodeRoles.map(row => row.predictedNodeRoles)).toEqual([
      ['payee_candidate'],
      ['change'],
    ]);
  });

  it('distinguishes followed intermediate nodes from unspent end receivers', () => {
    const pathFixture = {
      ...verifiedFixture,
      id: 'reviewed-path-fixture',
      expectedOutputs: [
        { ...verifiedFixture.expectedOutputs[0], expectedNodeRole: 'intermediate' },
        { ...verifiedFixture.expectedOutputs[1], expectedNodeRole: 'end_receiver' },
      ],
    };
    const trace = {
      nodes: [
        { id: 'middle', type: 'hop', details: { address: 'bc1qpayment', outspendSpent: true } },
        { id: 'receiver', type: 'receiver', details: { address: 'bc1qchange', outspendSpent: false } },
        { id: 'tx_spend', type: 'hop', details: {} },
      ],
      links: [
        { source: `tx_${TXID}`, target: 'middle', txid: TXID, outputIndex: 0, value: '1 BTC' },
        {
          source: 'middle',
          target: 'tx_spend',
          value: '1 BTC',
          previousTxid: TXID,
          outputIndex: 0,
          inputOutpoint: `${TXID}:0`,
        },
        { source: `tx_${TXID}`, target: 'receiver', txid: TXID, outputIndex: 1, value: '2 BTC' },
      ],
    };
    const result = evaluateTraceAgainstGroundTruth(trace, pathFixture);
    expect(result.nodeRoleAccuracy).toBe(1);
    expect(result.nodeRoleCoverage).toBe(1);
    expect(result.nodeRoles.map(row => row.predictedNodeRoles)).toEqual([
      ['intermediate'],
      ['payee_candidate', 'end_receiver'],
    ]);

    const brokenSpendLinkTrace = {
      ...trace,
      links: trace.links.map(link => link.source === 'middle'
        ? { ...link, inputOutpoint: `${TXID}:1` }
        : link),
    };
    const brokenResult = evaluateTraceAgainstGroundTruth(brokenSpendLinkTrace, pathFixture);
    expect(brokenResult.nodeRoles[0]).toMatchObject({
      pathRole: 'trace_boundary',
      matched: false,
      predictionAvailable: false,
    });
    expect(brokenResult.nodeRoleAccuracy).toBe(0.5);
    expect(brokenResult.nodeRoleCoverage).toBe(0.5);
  });

  it('reports no verified benchmark cases instead of a misleading perfect score', () => {
    expect(evaluateGroundTruthBenchmark([])).toEqual({
      status: 'NO_VERIFIED_CASES',
      caseCount: 0,
      cases: [],
      aggregate: null,
    });
  });

  it('evaluates Bitcoin.com’s first-payment labels through the tracer pipeline', async () => {
    const firstTxid = TRACE_BENCHMARK_CASES[0].expectedOutputs[0].txid;
    const tx = {
      txid: firstTxid,
      fee: 0,
      size: 275,
      weight: 1100,
      vin: [{
        sequence: 0xffffffff,
        prevout: {
          scriptpubkey: '410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac',
          scriptpubkey_asm: 'OP_PUSHBYTES_65 0411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3 OP_CHECKSIG',
          scriptpubkey_type: 'p2pk',
          value: 5000000000,
        },
      }],
      vout: [
        {
          scriptpubkey_asm: 'OP_PUSHBYTES_65 04ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84c OP_CHECKSIG',
          scriptpubkey_type: 'p2pk',
          value: 1000000000,
        },
        {
          scriptpubkey_asm: 'OP_PUSHBYTES_65 0411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3 OP_CHECKSIG',
          scriptpubkey_type: 'p2pk',
          value: 4000000000,
        },
      ],
      status: { confirmed: true, block_height: 170, block_time: 1231731025 },
    };
    const changeSpender = 'a16f3ce4dd5deb92d98ef5cf8afeaf0775ebca408f708b2146c4fb42b41e14be';
    const paymentSpender = 'ea44e97271691990157559d0bdd9959e02790c34db6c006d779e82fa5aee708e';
    const response = data => ({ ok: true, status: 200, json: async () => data });
    const childTx = (txid, blockHeight, blockTime) => ({
      txid, fee: 0, size: 100, vsize: 100, weight: 400,
      vin: [], vout: [],
      status: { confirmed: true, block_height: blockHeight, block_time: blockTime },
    });
    clearCache();
    vi.stubGlobal('fetch', async url => {
      if (url.includes(`/tx/${firstTxid}/outspends`)) {
        return response([
          {
            spent: true,
            txid: paymentSpender,
            status: {
              confirmed: true,
              block_height: 92240,
              block_hash: '0000000000077430a94a5376bf2af42d4b1aebdecedfa9e4f7e3f0465a84d891',
              block_time: 1289939967,
            },
          },
          {
            spent: true,
            txid: changeSpender,
            status: {
              confirmed: true,
              block_height: 181,
              block_hash: '00000000dc55860c8a29c58d45209318fa9e9dc2c1833a7226d86bc465afc6e5',
              block_time: 1231740133,
            },
          },
        ]);
      }
      if (url.includes(`/tx/${firstTxid}`)) return response(tx);
      if (url.includes(`/tx/${paymentSpender}/outspends`) || url.includes(`/tx/${changeSpender}/outspends`)) {
        return response([]);
      }
      if (url.includes(`/tx/${paymentSpender}`)) return response(childTx(paymentSpender, 92240, 1289939967));
      if (url.includes(`/tx/${changeSpender}`)) return response(childTx(changeSpender, 181, 1231740133));
      return { ok: false, status: 404, json: async () => ({}) };
    });
    try {
      const trace = await traceEndReceiver(firstTxid, 1);
      const benchmarkCase = TRACE_BENCHMARK_CASES[0];
      const result = evaluateTraceAgainstGroundTruth(trace, benchmarkCase);
      expect(result).toMatchObject({
        matchedOutputs: 2,
        expectedOutputs: 2,
        predictedOutputs: 2,
        precision: 1,
        recall: 1,
        classificationAccuracy: 1,
        nodeRoleAccuracy: 1,
        nodeRoleCoverage: 1,
      });
      expect(result.nodeRoles.map(row => row.predictedNodeRoles)).toEqual([
        ['payee_candidate', 'intermediate'],
        ['change', 'intermediate'],
      ]);
      expect(trace.meta.collection.sourceManifest[0].transactionResponse.canonicalResponseSha256).toMatch(/^SHA256:/);
      const aggregate = evaluateGroundTruthBenchmark([benchmarkCase], {
        [benchmarkCase.id]: trace,
      });
      expect(aggregate).toMatchObject({
        status: 'SOURCE_CORROBORATED',
        caseCount: 1,
        aggregate: { precision: 1, recall: 1, classificationAccuracy: 1, nodeRoleAccuracy: 1, nodeRoleCoverage: 1 },
      });
    } finally {
      vi.unstubAllGlobals();
      clearCache();
    }
  });

  it('aggregates only source-backed reviewed cases', () => {
    const benchmark = evaluateGroundTruthBenchmark([verifiedFixture], {
      [verifiedFixture.id]: {
        nodes: [
          { id: 'pay', type: 'receiver', details: { address: 'bc1qpayment' } },
          { id: 'change', type: 'change', details: { address: 'bc1qchange' } },
        ],
        links: [
          { source: `tx_${TXID}`, target: 'pay', txid: TXID, outputIndex: 0, value: '1 BTC' },
          { source: `tx_${TXID}`, target: 'change', txid: TXID, outputIndex: 1, value: '2 BTC' },
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
