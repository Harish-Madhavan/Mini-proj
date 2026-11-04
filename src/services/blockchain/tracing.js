import { fetchTx, fetchOutspends, fetchAddressSummaries, getResponseProvenance } from './gateway';
import {
  getAddressOrIdentifier,
  getScriptTypeFromAddress,
  calculateTxMetrics,
  isCoinJoinTransaction,
  prepareOutput
} from './transactionFormatting';
import { checkValueConservation, computeTraceConfidence, isDustOutput, TRACE_CONFIG, DUST_THRESHOLD_SATS } from '../../utils/traceHeuristics';
import { buildTxHubNode, buildInputNode, buildOpReturnNode, buildOutputNode } from '../../utils/graphBuilders';
import { satsToBtc } from '../../utils/forensicUtils';
import { auditTraceCorrectness } from '../../utils/traceVerification';
/**
 * Enhanced Recursive Outspends Tracing â€” BFS level-order with parallel fetching, confidence propagation, and CoinJoin halt.
 * Returns { nodes, links, meta: { confidence, warnings, haltReason, stats } }
 * Throws when the ROOT transaction itself cannot be fetched (unknown txid or
 * unreachable gateways) so callers fall back to the algorithmic trace with the
 * reason attached â€” instead of planting a corrupt empty case behind a false
 * "completed" toast. Deeper-hop failures only warn and prune that branch.
 */
export async function traceEndReceiver(startTxId, maxDepth = 2) {
  const nodes = [];
  const links = [];
  const processedTxs = new Set();
  const seenAddresses = new Set();
  const pendingHeuristics = [];
  const warnings = [];
  const omittedNodeIds = [];
  const prunedBranches = [];
  const sourceManifest = [];
  let haltReason = null;
  let nodeLimitReached = false;
  let omittedInputNodeCount = 0;
  let omittedLinkCount = 0;
  let totalFetched = 0;

  // Dedup helpers
  const nodeIds = new Set();
  function recordOmittedNode(nodeId, reason = 'NODE_LIMIT') {
    if (reason === 'NODE_LIMIT' || haltReason === null) haltReason = reason;
    if (!omittedNodeIds.includes(nodeId)) omittedNodeIds.push(nodeId);
    const warning = reason === 'INPUT_LIMIT'
      ? `Input node limit ${TRACE_CONFIG.MAX_INPUT_NODES} reached; additional input leaves are omitted.`
      : `Total node limit ${TRACE_CONFIG.MAX_NODES} reached; additional nodes and dependent edges are omitted.`;
    if (!warnings.includes(warning)) {
      warnings.push(warning);
    }
  }
  function addNode(node) {
    if (nodeIds.has(node.id)) return true;
    if (nodeIds.size >= TRACE_CONFIG.MAX_NODES) {
      nodeLimitReached = true;
      recordOmittedNode(node.id);
      return false;
    }
    nodeIds.add(node.id);
    nodes.push(node);
    return true;
  }
  const linkKeys = new Set();
  function addLink(src, tgt, value, ts, tx = null, provenance = {}) {
    if (!nodeIds.has(src) || !nodeIds.has(tgt)) {
      omittedLinkCount++;
      return;
    }
    const k = `${src}->${tgt}::${value}::${provenance.txid || tx?.txid || ''}::${provenance.outputIndex ?? ''}::${provenance.inputOutpoint || ''}`;
    if (!linkKeys.has(k)) {
      linkKeys.add(k);
      links.push({
        source: src,
        target: tgt,
        value,
        timestamp: ts,
        txid: provenance.txid || tx?.txid || null,
        blockTime: provenance.blockTime || tx?.status?.block_time || null,
        blockHeight: provenance.blockHeight || tx?.status?.block_height || null,
        ...provenance,
      });
    }
  }

  // BFS queue: array of { txId, depth, parentOutNodeId, parentValue, branchValueSats }
  let frontier = [{ txId: startTxId, depth: 0, parentOutNodeId: null, parentValue: null, branchValueSats: Number.MAX_SAFE_INTEGER, limit: maxDepth }];
  let depthReached = 0;

  // Bounded-parallel fetch: full Promise.all over a 24-wide frontier fires
  // ~48 API calls at once and trips gateway rate limits (429). Chunks of 5
  // keep throughput high without hammering the failover endpoints.
  async function fetchTxBatch(ids) {
    const results = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(async (id) => {
        try {
          const [tx, outspends] = await Promise.all([fetchTx(id), fetchOutspends(id)]);
          totalFetched++;
          return {
            id,
            tx,
            outspends,
            error: null,
            sources: {
              transaction: getResponseProvenance(`/tx/${id}`),
              outspends: getResponseProvenance(`/tx/${id}/outspends`),
            },
          };
        } catch (e) {
          return { id, tx: null, outspends: null, error: e.message };
        }
      }));
      results.push(...chunkResults);
    }
    return results;
  }

  for (let depth = 0; depth <= maxDepth + TRACE_CONFIG.EXTRA_PEEL_DEPTH && frontier.length > 0; depth++) {
    // Budget counts structural nodes only (tx hubs + outputs). Input leaves
    // (`in_*`) never expand, so letting a heavy fan-in root (e.g. a 592-in
    // seizure sweep = ~400 leaves) spend the whole budget would truncate the
    // trace before the spent branches are ever followed.
    if (nodeLimitReached || nodeIds.size >= TRACE_CONFIG.MAX_NODES) {
      haltReason = 'NODE_LIMIT';
      break;
    }
    if (frontier.length > TRACE_CONFIG.MAX_BRANCHING * 2) {
      const pruned = frontier
        .slice()
        .sort((a, b) => (a.branchValueSats || 0) - (b.branchValueSats || 0))
        .slice(0, frontier.length - TRACE_CONFIG.MAX_BRANCHING * 2);
      prunedBranches.push(...pruned.map(({ txId, branchValueSats }) => ({ txId, valueSats: branchValueSats || 0 })));
      warnings.push(`Branching limit pruned ${pruned.length} branch(es): ${pruned.map(b => `${b.txId} (${b.branchValueSats || 0} sats)`).join(', ')}`);
      // Prune lowest-value branches first so the dominant money trail survives
      frontier = [...frontier]
        .sort((a, b) => (b.branchValueSats || 0) - (a.branchValueSats || 0))
        .slice(0, TRACE_CONFIG.MAX_BRANCHING * 2);
    }

    // Fetch all txs in frontier with bounded parallelism
    const txIds = frontier.map(f => f.txId);
    const uniqueTxIds = [...new Set(txIds.filter(id => !processedTxs.has(id)))];
    if (uniqueTxIds.length === 0) break;

    let txResults;
    try {
      txResults = await fetchTxBatch(uniqueTxIds);
    } catch (e) {
      warnings.push(`Batch fetch failed at depth ${depth}: ${e.message}`);
      break;
    }
    depthReached = Math.max(depthReached, depth);

    sourceManifest.push(...txResults
      .filter(result => result.tx)
      .map(result => ({
        txid: result.id,
        blockHeight: result.tx.status?.block_height ?? null,
        blockHash: result.tx.status?.block_hash ?? null,
        blockTime: result.tx.status?.block_time ?? null,
        transactionResponse: result.sources?.transaction || null,
        outspendsResponse: result.sources?.outspends || null,
      })));

    const txMap = new Map(txResults.map(r => [r.id, r]));
    const nextFrontier = [];

    for (const item of frontier) {
      if (processedTxs.has(item.txId)) {
        if (item.parentOutNodeId) {
          const repeatedTx = txMap.get(item.txId)?.tx || null;
          addLink(item.parentOutNodeId, `tx_${item.txId}`, item.parentValue || '0 BTC', 'Forwarded', repeatedTx, {
            txid: item.txId,
            previousTxid: item.parentTxId || null,
            outputIndex: item.parentOutputIndex ?? null,
            inputIndex: item.spendingInputIndex ?? null,
            inputOutpoint: item.inputOutpoint || null,
            spendingTxid: item.txId,
            blockTime: repeatedTx?.status?.block_time || null,
            blockHeight: repeatedTx?.status?.block_height || null,
          });
        }
        continue;
      }
      processedTxs.add(item.txId);

      const res = txMap.get(item.txId);
      if (!res || res.error || !res.tx) {
        if (item.txId === startTxId && depth === 0) {
          const reason = /404/.test(res?.error || '')
            ? 'not found on the live network (checked Blockstream and Mempool.space)'
            : (res?.error || 'fetch failed on both sources');
          throw new Error(`Transaction ${startTxId.slice(0, 12)}... ${reason}`);
        }
        warnings.push(`Failed to fetch tx ${item.txId.slice(0, 8)}: ${res?.error || 'unknown'}`);
        continue;
      }
      const tx = res.tx;
      const outspends = res.outspends || [];
      const conservation = checkValueConservation(tx);
      if (!conservation.valid) warnings.push(`Value conservation failed for ${item.txId.slice(0, 8)}: ${conservation.reason}`);

      const metrics = calculateTxMetrics(tx);
      const isCoinJoin = isCoinJoinTransaction(tx);
      if (isCoinJoin && TRACE_CONFIG.COINJOIN_HALT) {
        warnings.push(`Mixing detected at ${item.txId.slice(0, 8)} â€” stopping this branch (trail breaks here)`);
        // Still emit tx node but don't expand its outputs
        if (depth === 0) haltReason = 'COINJOIN_AT_ROOT';
      }

      const txNodeId = `tx_${item.txId}`;
      // Attach depth for heuristic decay and build via factory
      tx._traceDepth = depth;
      const hubReason = isCoinJoin ? `Mixing across ${tx.vin?.length || 0} inputs â€” stopped here.` : `Fee ${metrics.feeRateSatVb} satoshis per byte (${metrics.vsize} bytes). ${conservation.valid ? '' : conservation.reason}`;
      addNode(buildTxHubNode({
        txId: item.txId,
        metrics: { ...metrics, blockTime: tx.status?.block_time, blockConfirmation: metrics.blockConfirmation, riskReason: hubReason, conservation },
        isCoinJoin,
        conservation,
        depth,
        totalOutSats: (tx.vout || []).reduce((s, o) => s + (o.value || 0), 0),
      }));

      if (item.parentOutNodeId) {
        addLink(item.parentOutNodeId, txNodeId, item.parentValue || '0 BTC', 'Forwarded', tx, {
          previousTxid: item.parentTxId || null,
          outputIndex: item.parentOutputIndex ?? null,
          inputIndex: item.spendingInputIndex ?? null,
          inputOutpoint: item.inputOutpoint || null,
          spendingTxid: item.txId,
        });
      }

      // Input leaves are bounded too, but leave enough room for a continuation
      // transaction and its first output when this branch can still expand.
      const inputScriptTypes = [];
      if (depth === 0) {
        let emittedInputNodes = 0;
        const remainingCapacity = Math.max(0, TRACE_CONFIG.MAX_NODES - nodeIds.size);
        const continuationReserve = depth < (item.limit ?? maxDepth) ? 2 : 0;
        const outputReserve = Math.min(
          (tx.vout || []).length,
          Math.max(0, remainingCapacity - continuationReserve)
        );
        for (const input of (tx.vin || [])) {
          if (nodeLimitReached) break;
          const addr = input.prevout ? getAddressOrIdentifier(input.prevout) : (input.is_coinbase ? 'Coinbase (Mining Reward)' : null);
          const scriptStd = input.prevout ? getScriptTypeFromAddress(addr, input.prevout?.scriptpubkey_type) : 'Coinbase';
          if (scriptStd) inputScriptTypes.push(scriptStd);
          if (addr) {
            seenAddresses.add(addr);
            const sat = input.prevout?.value || 0;
            const valBtc = satsToBtc(sat);
            const inputNodeId = `in_${addr}`;
            if (emittedInputNodes >= TRACE_CONFIG.MAX_INPUT_NODES) {
              recordOmittedNode(inputNodeId, 'INPUT_LIMIT');
              omittedInputNodeCount++;
              omittedLinkCount++;
              continue;
            }
            if (nodeIds.size >= TRACE_CONFIG.MAX_NODES - outputReserve - continuationReserve) {
              recordOmittedNode(inputNodeId);
              omittedInputNodeCount++;
              omittedLinkCount++;
              continue;
            }
            if (addNode(buildInputNode({ addr, scriptStd, satoshis: sat }))) {
              emittedInputNodes++;
              addLink(inputNodeId, txNodeId, `${valBtc} BTC`, 'On-chain', tx, {
                inputOutpoint: input.txid && Number.isInteger(input.vout) ? `${input.txid}:${input.vout}` : null,
              });
            }
          }
        }
      } else {
        // For deeper levels, still collect types for heuristic but don't re-emit inputs
        for (const v of (tx.vin || [])) {
          const a = v.prevout?.scriptpubkey_address;
          const t = v.prevout?.scriptpubkey_type;
          if (a || t) inputScriptTypes.push(getScriptTypeFromAddress(a || 'unknown', t || ''));
        }
      }

      if (isCoinJoin && TRACE_CONFIG.COINJOIN_HALT) continue;
      if (depth >= (item.limit ?? maxDepth)) continue;

      // Pass 1: classify everything without chain data.
      const pending = [];
      const pendingOutputIds = new Set();
      for (let i = 0; i < (tx.vout || []).length; i++) {
        if (nodeLimitReached) break;
        const output = tx.vout[i];
        const prep = prepareOutput({ tx, txid: item.txId, output, outputIndex: i, outspends, inputScriptTypes, seenAddresses, isCoinJoin });
        if (prep.opReturn) {
          if (!addNode(buildOpReturnNode({ txId: item.txId, index: i, payload: prep.opReturn }))) break;
          addLink(txNodeId, `op_${item.txId}_${i}`, '0 BTC Data', 'Embedded', tx, { txid: item.txId, outputIndex: i });
          continue;
        }
        const outNodeId = nodeIds.has(prep.outNodeId) || pendingOutputIds.has(prep.outNodeId)
          ? `out_utxo_${item.txId}_${i}`
          : prep.outNodeId;
        pendingOutputIds.add(outNodeId);
        pending.push({ output, index: i, ...prep, outNodeId });
      }

      // Pass 2: chain-reuse check (H9), gated on ambiguity so decisive calls
      // never cost a request. Skips dust, bare-key outputs without addresses,
      // current-tx inputs (self-transfers are already decisive), and
      // trace-seen addresses (H2 covers those). Failures degrade to missing
      // entries, which score as no-signal.
      const selfAddrs = new Set((tx.vin || []).map(v => v.prevout?.scriptpubkey_address).filter(Boolean));
      const needy = pending.filter(p =>
        p.cls?.heuristics && Math.abs(p.cls.heuristics.score) <= 1.0 &&
        p.output.scriptpubkey_address &&
        (p.output.value || 0) >= DUST_THRESHOLD_SATS &&
        !seenAddresses.has(p.output.scriptpubkey_address) &&
        !selfAddrs.has(p.output.scriptpubkey_address)
      );
      if (needy.length > 0) {
        const addressMeta = await fetchAddressSummaries(needy.map(p => p.output.scriptpubkey_address));
        for (const p of needy) {
          if (!addressMeta.has(p.output.scriptpubkey_address)) continue;
          const redo = prepareOutput({ tx, txid: item.txId, output: p.output, outputIndex: p.index, outspends, inputScriptTypes, seenAddresses, isCoinJoin, addressMeta });
          if (!redo.opReturn) p.cls = redo.cls;
        }
      }

      for (const p of pending) {
        if (nodeLimitReached) break;
        const { addr, valBtc, outNodeId, scriptStd, cls, output, index: i } = p;
        const outspend = outspends[i] || {};
        const isSpent = outspend.spent === true;
        const spendingTxId = outspend.txid || null;

        if (cls.heuristics) pendingHeuristics.push(cls.heuristics);

        const lastActive = cls.kycStatus?.includes('UNSPENT') ? 'Holds unspent funds' : cls.kycStatus?.includes('MIXED') ? 'Mixed funds' : 'On chain';
        if (!addNode(buildOutputNode({ outNodeId, addr, valBtc, scriptStd, cls, tx, lastActive, outspendSpent: outspend.spent }))) break;
        addLink(txNodeId, outNodeId, `${valBtc} BTC`, tx.status?.block_time ? new Date(tx.status.block_time*1000).toLocaleDateString() : 'On-chain', tx, {
          txid: item.txId,
          outputIndex: i,
          valueSats: output.value,
          scriptType: output.scriptpubkey_type || 'unknown',
        });
        seenAddresses.add(addr);

        // Queue next hop only if: spent, not dust, not CoinJoin, not self-loop, and under depth
        if (isSpent && spendingTxId && !cls.isDust && !cls.isCoinJoinOutput) {
          // Avoid loops: don't follow if address already traces to visited tx
          if (processedTxs.has(spendingTxId)) continue;
          // Prioritize change outputs less: if high confidence change, follow but don't mark as payment path
          // Always follow change to find ultimate peel end; payment branches are situational.
          const isHighConfChange = cls.isChange && (cls.confidence || 0) > 0.6;
          // High-confidence change extends its own budget (peel chains are
          // near-deterministic trails); every other branch keeps the parent's.
          // Capped at maxDepth + EXTRA_PEEL_DEPTH; node/prune caps backstop.
          const childLimit = Math.min(
            maxDepth + TRACE_CONFIG.EXTRA_PEEL_DEPTH,
            (item.limit ?? maxDepth) + (isHighConfChange ? 1 : 0)
          );
          // Carry branch value so over-wide frontiers prune dust first, not the money trail
          nextFrontier.push({
            txId: spendingTxId,
            depth: depth + 1,
            parentOutNodeId: outNodeId,
            parentTxId: item.txId,
            parentOutputIndex: i,
            spendingInputIndex: Number.isInteger(outspend.vin) ? outspend.vin : null,
            inputOutpoint: `${item.txId}:${i}`,
            parentValue: `${valBtc} BTC`,
            branchValueSats: output.value || 0,
            _isChange: isHighConfChange,
            limit: childLimit,
          });
        } else if (isDustOutput(output.value)) {
          // ignore
        }
      }
    }

    // Sort next frontier so change outputs are explored first (peel chain priority),
    // and higher-value branches are prioritized so dominant money trails survive pruning
    nextFrontier.sort((a, b) => {
      if (a._isChange !== b._isChange) return a._isChange ? -1 : 1;
      return (b.branchValueSats || 0) - (a.branchValueSats || 0);
    });
    const frontierLimit = TRACE_CONFIG.MAX_BRANCHING * 3;
    if (nextFrontier.length > frontierLimit) {
      const pruned = nextFrontier.slice(frontierLimit);
      prunedBranches.push(...pruned.map(({ txId, branchValueSats }) => ({ txId, valueSats: branchValueSats || 0 })));
      warnings.push(`Frontier limit pruned ${pruned.length} branch(es): ${pruned.map(b => `${b.txId} (${b.branchValueSats || 0} sats)`).join(', ')}`);
    }
    frontier = nextFrontier.slice(0, frontierLimit);
  }

  // No scored hops (e.g. halted at a mixing root before any output was
  // classified): report unknown rather than a default 50% that reads as
  // a measured result. All consumers null-check confidence first.
  const traceConf = pendingHeuristics.length > 0 ? computeTraceConfidence(pendingHeuristics) : null;
  const verification = auditTraceCorrectness({ nodes, links });
  const meta = {
    confidence: traceConf ? traceConf.confidence : null,
    confidenceLevel: traceConf ? traceConf.level : 'Unknown',
    ambiguousHops: traceConf ? traceConf.ambiguousCount : 0,
    verification,
    warnings,
    haltReason,
    stats: {
      fetchedTxCount: totalFetched,
      nodeCount: nodes.length,
      linkCount: links.length,
      depthReached,
      omittedNodeCount: omittedNodeIds.length,
      omittedInputNodeCount,
      omittedNodeIds,
      omittedLinkCount,
      prunedBranches,
    },
    collection: {
      schemaVersion: 1,
      completedAt: new Date().toISOString(),
      requestedDepth: maxDepth,
      sourceManifest,
    },
  };

  // Attach meta to result for consumers; keep nodes/links backward compatible
  return { nodes, links, meta };
}
