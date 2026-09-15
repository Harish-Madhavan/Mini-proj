/**
 * AegisTrace Forensic Narrative Generator (Investigating-Officer Module)
 *
 * Graph metrics don't file charge sheets — paragraphs do. This module renders
 * a case into a plain-English investigative narrative: what happened, what it
 * resembles, and — critically for evidentiary honesty — what the heuristics
 * CANNOT prove (change-vs-payment ambiguity, address ≠ identity, mixer
 * blindness). Every limitation is stated alongside the finding it qualifies,
 * so the dossier cannot be read as overstating attribution.
 */

import { calculateForensicRiskScore } from './riskScoring';
import { generateObfuscationDossier } from './obfuscationForensics';
import { parseBtcAmount } from './forensicUtils';

function sumRoutedBtc(links = []) {
  return links.reduce((s, l) => s + parseBtcAmount(l.value), 0);
}

/**
 * Render the narrative for a case.
 * @returns {{ headline: string, summary: string, findings: string[], limitations: string[], urgency: string }|null}
 */
export function generateForensicNarrative(activeCase) {
  if (!activeCase || !Array.isArray(activeCase.nodes)) return null;

  const nodes = activeCase.nodes;
  const links = activeCase.links || [];
  const risk = calculateForensicRiskScore(activeCase);
  const dossier = generateObfuscationDossier(activeCase);

  const suspects = nodes.filter(n => n.type === 'suspect').length;
  const hops = nodes.filter(n => n.type === 'hop').length;
  const mixers = nodes.filter(n => n.type === 'mixer').length;
  const receivers = nodes.filter(n => n.type === 'receiver');
  const routed = sumRoutedBtc(links);
  const traceConf = activeCase.traceMeta?.confidence;

  const headline = risk.threatBadge.level === 'HIGH'
    ? `High-risk pattern across ${hops} middle step${hops === 1 ? '' : 's'}`
    : risk.threatBadge.level === 'MEDIUM'
      ? `Multi-step flow under monitoring (${hops} step${hops === 1 ? '' : 's'})`
      : 'Standard on-chain flow without hiding signatures';

  const summary = `Case ${activeCase.id} tracks approximately ${routed.toFixed(4)} BTC across ` +
    `${nodes.length} entities and ${links.length} transfers, from ${suspects} origin ` +
    `wallet${suspects === 1 ? '' : 's'} to ${receivers.length} terminal endpoint${receivers.length === 1 ? '' : 's'}. ` +
    `Composite risk is ${risk.riskScore}/100 (${risk.threatBadge.label})` +
    (typeof traceConf === 'number' ? ` with trace confidence ${(traceConf * 100).toFixed(0)}% (${activeCase.traceMeta.confidenceLevel}).` : '.');

  const findings = [];
  if (mixers > 0) findings.push(`Privacy-mixer intermediation (${mixers} CoinJoin round${mixers === 1 ? '' : 's'}): post-mix outputs cannot be attributed to pre-mix inputs — the trail is probabilistically broken here.`);
  if (dossier?.peeling?.isPeelingChain) findings.push(`Split-pattern layering over ${dossier.peeling.compliantHopCount} shrinking steps (average split ${dossier.peeling.averagePeelPct}): looks like automated dispersal, not normal spending.`);
  if (dossier?.structuring?.detected) findings.push(`Split-payment signal: a batch of ${dossier.structuring.maxBandSize} similar small payments from one source (confidence ${dossier.structuring.confidence}%).`);
  if (dossier?.sweeps?.detected) {
    const imminent = dossier.sweeps.sweeps.some(s => s.cashoutUrgency === 'IMMINENT');
    findings.push(imminent
      ? 'Likely cash-out: gathered funds reached an exchange-held account. The freeze window is closing.'
      : 'Funds were gathered into one wallet: aggregation before the next stage, not a cash-out.');
  }
  if (risk.isKycVerified) findings.push('Terminal endpoint is an identity-checked exchange: subscriber identity is obtainable via Section 67 NDPS notice.');
  else if (receivers.length > 0) findings.push('Terminal endpoint has no identity records (unspent output / unknown wallet): keep watching for the next move before naming anyone.');
  if (findings.length === 0) findings.push('No splitting, mixing, or gathering patterns detected in the traced window.');

  const limitations = [
    'Change-vs-payment calls use weighted clues — any single step may be wrong.',
  ];
  if (mixers > 0) limitations.push('CoinJoin outputs carry broken trails by design: amounts past a mix round are estimates, not proven funds.');
  if (typeof traceConf === 'number' && traceConf < 0.55) limitations.push('Trace confidence is LOW: treat the endpoint as investigative lead, not evidentiary fact.');
  limitations.push('A Bitcoin address is not a person: identity requires exchange identity records obtained through lawful process (Sec. 67 NDPS / foreign legal request).');
  if (dossier?.bridgeScan?.detected) limitations.push('Cross-chain swap hops exit Bitcoin visibility entirely — destination-chain tracing needs a separate investigation.');

  return {
    headline,
    summary,
    findings,
    limitations,
    urgency: risk.statutoryAction.urgency,
    recommendedActions: risk.statutoryAction.recommendations,
  };
}
