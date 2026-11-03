/**
 * AegisTrace Chain-of-Custody Ledger (Evidence Admissibility Module)
 *
 * A forensic report is only as strong as its chain of custody: WHO held the
 * funds, WHEN (block time), and WHAT moved WHERE. This module linearizes a
 * case graph into chronological custody events and hash-chains them
 * (each event commits to the previous event's digest), so any later edit,
 * deletion, or reordering of the evidence trail is mechanically detectable
 * via `verifyChainOfCustody`.
 *
 * The event chain uses SHA-256 through Web Crypto. It is not digitally signed
 * or externally anchored, so it detects accidental changes but does not prove
 * who created the events, source authenticity, or legal chain of custody.
 */

import { parseBtcAmount } from './forensicUtils';
import { hashEvidencePayload } from './evidenceIntegrity';

/** SHA-256 digest of an event payload; this digest is not externally anchored. */
export async function chainDigest(input) {
  return hashEvidencePayload(input);
}

const GENESIS_PREV_HASH = 'GENESIS';

/**
 * Build the custody timeline for a case.
 * @returns {{ events: Array, eventCount: number, gaps: Array, terminalHash: string|null }}
 */
export async function buildChainOfCustody(caseObj) {
  if (!caseObj || !Array.isArray(caseObj.nodes) || !Array.isArray(caseObj.links)) {
    return { events: [], eventCount: 0, gaps: [], terminalHash: null };
  }
  const { nodes, links } = caseObj;
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Order transfers chronologically where block times exist; otherwise keep
  // graph emission order (stable fallback, flagged as approximate).
  const ordered = links.map((l, index) => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    const srcNode = nodeById.get(src);
    const tgtNode = nodeById.get(tgt);
    const blockTime = tgtNode?.details?.blockTime || srcNode?.details?.blockTime || null;
    return { link: l, src, tgt, srcNode, tgtNode, blockTime, index };
  }).sort((a, b) => {
    if (a.blockTime != null && b.blockTime != null && a.blockTime !== b.blockTime) return a.blockTime - b.blockTime;
    if (a.blockTime != null && b.blockTime == null) return -1;
    if (a.blockTime == null && b.blockTime != null) return 1;
    return a.index - b.index;
  });

  const events = [];
  const gaps = [];
  let prevHash = GENESIS_PREV_HASH;

  for (const [seq, t] of ordered.entries()) {
    const amountBtc = parseBtcAmount(t.link.value);
    const approximateOrder = t.blockTime == null;
    const core = {
      seq: seq + 1,
      from: t.srcNode?.details?.address || t.src,
      fromLabel: t.srcNode?.label || t.src,
      to: t.tgtNode?.details?.address || t.tgt,
      toLabel: t.tgtNode?.label || t.tgt,
      amountBtc: parseFloat(amountBtc.toFixed(8)),
      blockTime: t.blockTime,
      approximateOrder,
    };
    // Gap flag: consecutive on-chain transfers that LOSE value beyond fees,
    // or an unanchored (dateless) hop breaking the chronological chain.
    if (seq > 0) {
      const prevAmount = events[seq - 1].amountBtc;
      if (prevAmount > 0 && core.amountBtc < prevAmount * 0.5 && core.amountBtc > 0) {
        gaps.push({ afterSeq: seq, kind: 'VALUE_DISCONTINUITY', note: `Transfer ${seq + 1} moves <50% of the prior hop — funds may have branched off-graph.` });
      }
      if (approximateOrder && !events[seq - 1].approximateOrder) {
        gaps.push({ afterSeq: seq, kind: 'UNANCHORED_HOP', note: `Transfer ${seq + 1} has no block timestamp — order is graph-emission approximate.` });
      }
    }
    const eventHash = await chainDigest({ ...core, prevHash });
    events.push({ ...core, prevHash, eventHash });
    prevHash = eventHash;
  }

  return {
    events,
    eventCount: events.length,
    gaps,
    terminalHash: events.length > 0 ? events[events.length - 1].eventHash : null,
  };
}

/**
 * Recompute and verify a custody chain. Returns the first break point, if any.
 */
export async function verifyChainOfCustody(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return { valid: false, checkedEvents: 0, brokenAtSeq: null, reason: 'Empty chain' };
  }
  let prevHash = GENESIS_PREV_HASH;
  for (const e of events) {
    if (e.prevHash !== prevHash) {
      return { valid: false, checkedEvents: events.length, brokenAtSeq: e.seq, reason: `prevHash mismatch at seq ${e.seq} — chain reordered or spliced` };
    }
    const { eventHash, ...core } = e;
    if (await chainDigest({ ...core, prevHash: e.prevHash }) !== eventHash) {
      return { valid: false, checkedEvents: events.length, brokenAtSeq: e.seq, reason: `event digest mismatch at seq ${e.seq} — event edited after sealing` };
    }
    prevHash = eventHash;
  }
  return { valid: true, checkedEvents: events.length, brokenAtSeq: null, reason: 'Chain intact' };
}
