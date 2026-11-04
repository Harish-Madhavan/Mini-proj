/**
 * Compare only observable Bitcoin transaction facts. This evaluator does not
 * validate ownership, intent, payment/change roles, or any other forensic label.
 */
export function evaluateTraceAgainstChainFacts(trace, reference) {
  if (!reference || !/^[0-9a-f]{64}$/i.test(reference.txid || '')) {
    throw new TypeError('A chain-fact reference with a valid transaction ID is required.');
  }
  if (!Number.isInteger(reference.blockHeight) || !Array.isArray(reference.outputs)) {
    throw new TypeError('Chain-fact reference must include a block height and output list.');
  }

  const txid = reference.txid.toLowerCase();
  const manifest = (trace?.meta?.collection?.sourceManifest || [])
    .find(entry => entry.txid?.toLowerCase() === txid);
  const actualBlockHeight = manifest?.blockHeight ?? null;
  const nodes = new Map((trace?.nodes || []).map(node => [node.id, node]));
  const actualOutputs = new Map();
  for (const link of trace?.links || []) {
    if (link.txid?.toLowerCase() !== txid || !Number.isInteger(link.outputIndex)) continue;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const node = nodes.get(targetId);
    actualOutputs.set(link.outputIndex, {
      valueSats: Number.isSafeInteger(link.valueSats) ? link.valueSats : null,
      scriptType: link.scriptType ?? null,
      traceIdentifier: node?.details?.address ?? null,
    });
  }

  const outputResults = reference.outputs.map(expected => {
    const actual = actualOutputs.get(expected.outputIndex);
    const errors = [];
    if (!actual) errors.push('MISSING_OUTPUT');
    else {
      if (actual.valueSats !== expected.valueSats) errors.push('VALUE_MISMATCH');
      if (expected.scriptType && actual.scriptType !== expected.scriptType) errors.push('SCRIPT_TYPE_MISMATCH');
      if (actual.traceIdentifier !== expected.traceIdentifier) errors.push('IDENTIFIER_MISMATCH');
    }
    return { outputIndex: expected.outputIndex, matched: errors.length === 0, errors };
  });
  const extraOutputIndexes = [...actualOutputs.keys()]
    .filter(index => !reference.outputs.some(output => output.outputIndex === index));
  const blockMatches = actualBlockHeight === reference.blockHeight;
  const coverageComplete = actualBlockHeight !== null &&
    outputResults.every(output => !output.errors.includes('MISSING_OUTPUT')) &&
    extraOutputIndexes.length === 0;
  const mismatch = (actualBlockHeight !== null && !blockMatches) || outputResults.some(output =>
    output.errors.some(error => error !== 'MISSING_OUTPUT')) || extraOutputIndexes.length > 0;

  return {
    referenceId: reference.id,
    txid,
    status: mismatch ? 'MISMATCH' : coverageComplete ? 'MATCH' : 'INCOMPLETE',
    expectedBlockHeight: reference.blockHeight,
    actualBlockHeight,
    blockMatches,
    expectedOutputCount: reference.outputs.length,
    actualOutputCount: actualOutputs.size,
    matchedOutputCount: outputResults.filter(output => output.matched).length,
    outputs: outputResults,
    extraOutputIndexes,
    limitations: 'Checks transaction block height, output index, exact satoshi value, and trace identifier only. It does not validate labels, ownership, intent, or legal findings.',
  };
}

export function evaluateChainFactBenchmark(references, tracesById = {}) {
  if (!Array.isArray(references)) throw new TypeError('Chain-fact references must be an array.');
  if (references.length === 0) {
    return { status: 'NO_CHAIN_FACT_REFERENCES', referenceCount: 0, results: [] };
  }
  const results = references.map(reference =>
    evaluateTraceAgainstChainFacts(tracesById[reference.id], reference)
  );
  return {
    status: results.every(result => result.status === 'MATCH')
      ? 'MATCH'
      : results.some(result => result.status === 'MISMATCH') ? 'MISMATCH' : 'INCOMPLETE',
    referenceCount: references.length,
    results,
  };
}
