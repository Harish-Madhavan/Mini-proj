import { describe, expect, it } from 'vitest';
import { CHAIN_FACT_BENCHMARKS } from '../data/chainFactCorpus';
import { FORENSIC_CORPUS } from '../data/forensicCorpus';
import { evaluateChainFactBenchmark, evaluateTraceAgainstChainFacts } from './chainFactEvaluation';

function makeTrace(reference) {
  const nodes = [{ id: `tx_${reference.txid}`, type: 'hop' }];
  const links = [];
  for (const output of reference.outputs) {
    const id = `out_${output.outputIndex}`;
    nodes.push({ id, details: { address: output.traceIdentifier } });
    links.push({
      source: `tx_${reference.txid}`,
      target: id,
      txid: reference.txid,
      outputIndex: output.outputIndex,
      value: `${(output.valueSats / 1e8).toFixed(6)} BTC`,
      valueSats: output.valueSats,
      scriptType: output.scriptType,
    });
  }
  return {
    nodes,
    links,
    meta: { collection: { sourceManifest: [{ txid: reference.txid, blockHeight: reference.blockHeight }] } },
  };
}

describe('chain-fact corpus', () => {
  it('has a sourced exact snapshot for each transaction reference', () => {
    const txEntries = FORENSIC_CORPUS.filter(entry => entry.kind === 'tx');
    expect(CHAIN_FACT_BENCHMARKS.map(entry => entry.id)).toEqual(txEntries.map(entry => entry.key));
    expect(CHAIN_FACT_BENCHMARKS.reduce((sum, entry) => sum + entry.outputs.length, 0)).toBe(71);
    for (const reference of CHAIN_FACT_BENCHMARKS) {
      expect(reference.txid).toMatch(/^[0-9a-f]{64}$/);
      expect(reference.source.provider).toBeTruthy();
      expect(reference.source.endpoint).toContain(reference.txid);
      expect(reference.source.retrievedAt).toBeTruthy();
      expect(reference.source.canonicalResponseSha256).toMatch(/^SHA256:[0-9A-F]{64}$/);
      expect(reference.outputs.every(output =>
        Number.isInteger(output.outputIndex) && Number.isSafeInteger(output.valueSats) &&
        output.valueSats >= 0 && typeof output.traceIdentifier === 'string'
      )).toBe(true);
    }
  });

  it('matches exact block, output indexes, satoshi values, and identifiers', () => {
    const reference = CHAIN_FACT_BENCHMARKS.find(entry => entry.id === 'first-tx');
    expect(evaluateTraceAgainstChainFacts(makeTrace(reference), reference)).toMatchObject({
      status: 'MATCH',
      blockMatches: true,
      expectedOutputCount: 2,
      actualOutputCount: 2,
      matchedOutputCount: 2,
    });
  });

  it('reports fact mismatches and incomplete traces distinctly', () => {
    const reference = CHAIN_FACT_BENCHMARKS.find(entry => entry.id === 'first-tx');
    const goodTrace = makeTrace(reference);
    const badTrace = {
      ...goodTrace,
      links: goodTrace.links.map((link, index) => index === 0 ? { ...link, valueSats: link.valueSats + 1 } : link),
    };
    expect(evaluateTraceAgainstChainFacts(badTrace, reference).status).toBe('MISMATCH');
    expect(evaluateTraceAgainstChainFacts({ ...goodTrace, links: goodTrace.links.slice(0, 1) }, reference).status)
      .toBe('INCOMPLETE');
  });

  it('aggregates without turning missing traces into a passing score', () => {
    const reference = CHAIN_FACT_BENCHMARKS[0];
    expect(evaluateChainFactBenchmark([reference], { [reference.id]: makeTrace(reference) }).status).toBe('MATCH');
    expect(evaluateChainFactBenchmark([reference]).status).toBe('INCOMPLETE');
    expect(evaluateChainFactBenchmark([]).status).toBe('NO_CHAIN_FACT_REFERENCES');
  });
});
