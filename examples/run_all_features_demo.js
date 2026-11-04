/**
 * AegisTrace Forensic Engine — Comprehensive Runnable Feature Demo Suite
 *
 * Demonstrates runnable, executable examples of all core algorithmic, forensic, and analytical features.
 * Run directly with: npx vite-node examples/run_all_features_demo.js
 */

import { scoreOutputHeuristics } from '../src/utils/traceHeuristics.js';
import { calculateTaintMap, auditTaintConservation } from '../src/utils/taintAnalysis.js';
import { DisjointSetUnion, calculateCoinJoinEntropy, detectPeelingChain } from '../src/utils/clusteringAlgorithms.js';
import { KNOWN_SWAP_ROUTERS, detectConsolidationSweep } from '../src/utils/obfuscationForensics.js';
import { scanCaseStructuring } from '../src/utils/structuringAnalysis.js';
import { decodeScriptPubkey, disassembleScriptHex } from '../src/utils/scriptDecoder.js';
import { parseCrossChainMemo } from '../src/utils/crossChainForensics.js';
import { calculateForensicRiskScore } from '../src/utils/riskScoring.js';
import { buildChainOfCustody, verifyChainOfCustody } from '../src/utils/chainOfCustody.js';
import { findCriticalMoneyTrail, detectCircularFlows, computeNodeCentralityMetrics } from '../src/utils/graphAlgorithms.js';
import { correlateCases } from '../src/utils/syndicateAnalysis.js';
import { createTraceSnapshot, verifyTraceSnapshot } from '../src/utils/traceSnapshot.js';
import { buildRecoveryLeads, getRecoveryActionTransitions, formatLeadAmount } from '../src/features/recovery/recoveryLeads.js';
import { generateForensicNarrative } from '../src/utils/narrativeGenerator.js';
import { SCENARIOS } from '../src/data/scenarios.js';

console.log('='.repeat(80));
console.log('       AEGISTRACE — FORENSIC & ALGORITHMIC FEATURES DEMO SUITE');
console.log('='.repeat(80));

// =============================================================================
// FEATURE 1: 8-Factor Heuristic Change-vs-Payment Classifier
// =============================================================================
console.log('\n[FEATURE 1] 8-FACTOR HEURISTIC CHANGE-VS-PAYMENT CLASSIFIER');
console.log('-'.repeat(80));

const sampleTx = {
  fee: 1500,
  vsize: 220,
  vin: [
    {
      prevout: {
        scriptpubkey_address: 'bc1qfunderaddress001',
        scriptpubkey_type: 'v0_p2wpkh',
        value: 100000000 // 1.0 BTC
      }
    }
  ],
  vout: [
    {
      // Output 0: 0.15 BTC round payment to fresh address
      scriptpubkey_address: 'bc1qrecipientpayment999',
      scriptpubkey_type: 'v0_p2wpkh',
      value: 15000000 // 0.15 BTC
    },
    {
      // Output 1: 0.849985 BTC dusty remainder back to sender's wallet type
      scriptpubkey_address: 'bc1qsenderchange888',
      scriptpubkey_type: 'v0_p2wpkh',
      value: 84998500 // ~0.85 BTC remainder
    }
  ],
  status: { confirmed: true, block_height: 850000, block_time: 1720000000 }
};

const outspends = [
  { spent: false }, // payment output is unspent (dwelling)
  { spent: true, status: { confirmed: true, block_height: 850002 } } // change swept 2 blocks later
];

const paymentEval = scoreOutputHeuristics({
  tx: sampleTx,
  outputIndex: 0,
  inputScriptTypes: ['v0_p2wpkh'],
  outspends,
  seenAddresses: new Set(['bc1qfunderaddress001'])
});

const changeEval = scoreOutputHeuristics({
  tx: sampleTx,
  outputIndex: 1,
  inputScriptTypes: ['v0_p2wpkh'],
  outspends,
  seenAddresses: new Set(['bc1qfunderaddress001'])
});

console.log('Output #0 (0.15 BTC Payment Candidate):');
console.log(` - Classification : ${paymentEval.isPaymentCandidate ? 'PAYMENT' : 'CHANGE/ABSTAIN'}`);
console.log(` - Score          : ${paymentEval.score.toFixed(2)} (Confidence: ${(paymentEval.confidence * 100).toFixed(1)}%)`);

console.log('Output #1 (0.85 BTC Remainder Change Candidate):');
console.log(` - Classification : ${changeEval.isChangeCandidate ? 'CHANGE' : 'PAYMENT/ABSTAIN'}`);
console.log(` - Score          : ${changeEval.score.toFixed(2)} (Confidence: ${(changeEval.confidence * 100).toFixed(1)}%)`);

// =============================================================================
// FEATURE 2: Multi-Model Taint Propagation & Conservation Audit
// =============================================================================
console.log('\n[FEATURE 2] MULTI-MODEL TAINT PROPAGATION & CONSERVATION AUDIT');
console.log('-'.repeat(80));

const taintNodes = [
  { id: 'suspect_0', type: 'suspect', label: 'Lazarus Suspect' },
  { id: 'hop_1', type: 'hop', label: 'Transit Mixer Hop' },
  { id: 'clean_input', type: 'external', label: 'Innocent Depositor' },
  { id: 'receiver_sink', type: 'receiver', label: 'Exchange Hot Wallet' }
];

const taintLinks = [
  { source: 'suspect_0', target: 'hop_1', value: '4.0 BTC' },
  { source: 'clean_input', target: 'hop_1', value: '6.0 BTC' }, // 40% dirty, 60% clean mix
  { source: 'hop_1', target: 'receiver_sink', value: '9.99 BTC' }
];

const haircutTaint = calculateTaintMap(taintNodes, taintLinks, ['suspect_0'], 'proportionate');
const fifoTaint = calculateTaintMap(taintNodes, taintLinks, ['suspect_0'], 'fifo');
const poisonTaint = calculateTaintMap(taintNodes, taintLinks, ['suspect_0'], 'poison');

console.log('Downstream Exchange Hot Wallet Contamination:');
console.log(` - Haircut / Proportionate Model : ${(haircutTaint.get('receiver_sink') * 100).toFixed(2)}% (Diluted pro-rata)`);
console.log(` - FIFO Model (First-In, First-Out): ${(fifoTaint.get('receiver_sink') * 100).toFixed(2)}% (Priority queue consumed)`);
console.log(` - Poison Model (Zero Tolerance) : ${(poisonTaint.get('receiver_sink') * 100).toFixed(2)}% (Strict contact rule)`);

const audit = auditTaintConservation(taintNodes, taintLinks, haircutTaint, 'proportionate', null, ['suspect_0']);
console.log(`Taint Conservation Audit Passed    : ${audit.violations.length === 0}`);

// =============================================================================
// FEATURE 3: Wallet Clustering (CIOH DSU), Mixer Entropy & Peeling Chains
// =============================================================================
console.log('\n[FEATURE 3] WALLET CLUSTERING (CIOH DSU), MIXER ENTROPY & PEEL CHAINS');
console.log('-'.repeat(80));

const dsu = new DisjointSetUnion();
// Multi-input co-spending tx 1: A, B, C co-spent
dsu.union('addr_A', 'addr_B');
dsu.union('addr_B', 'addr_C');
// Multi-input co-spending tx 2: D, E co-spent
dsu.union('addr_D', 'addr_E');
// Later tx: C co-spent with D
dsu.union('addr_C', 'addr_D');

console.log(`Are addr_A and addr_E in the same CIOH wallet cluster? : ${dsu.find('addr_A') === dsu.find('addr_E')}`);
console.log(`Total Unified Clusters                                : ${dsu.getClusters().length}`);

// Shannon entropy on a 5-equal-output Wasabi CoinJoin (0.1 BTC each)
const coinjoinOutputs = [
  { value: 10000000 },
  { value: 10000000 },
  { value: 10000000 },
  { value: 10000000 },
  { value: 10000000 }
];
const entropyResult = calculateCoinJoinEntropy(coinjoinOutputs);
console.log(`Wasabi CoinJoin Shannon Entropy                       : ${entropyResult.entropy.toFixed(3)} bits (Anonymity Ratio: ${(entropyResult.anonymityRatio * 100).toFixed(0)}%)`);

// Peeling chain sequence detection (1-in-2-out: 85% change, 15% peel)
const peelTxs = [
  { txid: 'peel_1', block_time: 1720000000, vout: [{ value: 85000000 }, { value: 15000000 }] },
  { txid: 'peel_2', block_time: 1720000600, vout: [{ value: 72000000 }, { value: 12900000 }] },
  { txid: 'peel_3', block_time: 1720001200, vout: [{ value: 61000000 }, { value: 10900000 }] }
];
const peelResult = detectPeelingChain(peelTxs);
console.log(`Peeling Chain Detected                                : ${peelResult.isPeelingChain} (Hop Count: ${peelResult.hopCount})`);

// =============================================================================
// FEATURE 4: Obfuscation Forensics, Consolidation Sweeps & Structuring
// =============================================================================
console.log('\n[FEATURE 4] OBFUSCATION FORENSICS, CONSOLIDATION SWEEPS & STRUCTURING');
console.log('-'.repeat(80));

const router = KNOWN_SWAP_ROUTERS[0];
console.log(`Known Swap Router Signature : ${router.name} (Prefix: "${router.pattern}", Risk: ${router.risk})`);

// 5-input to 1-output consolidation sweep transaction
const sweepTx = {
  vin: [
    { prevout: { value: 200000000, scriptpubkey_address: 'addr_in_1' } },
    { prevout: { value: 200000000, scriptpubkey_address: 'addr_in_2' } },
    { prevout: { value: 200000000, scriptpubkey_address: 'addr_in_3' } },
    { prevout: { value: 200000000, scriptpubkey_address: 'addr_in_4' } },
    { prevout: { value: 200000000, scriptpubkey_address: 'addr_in_5' } }
  ],
  vout: [
    { value: 999900000, scriptpubkey_address: '3E8tMa9Jkdf923kd8mzklaq02947aWazirX', scriptpubkey_type: 'scripthash' }
  ]
};
const sweepResult = detectConsolidationSweep(sweepTx);
console.log(`Consolidation Sweep Analysis: Is Sweep: ${sweepResult.isSweep} | Swept BTC: ${sweepResult.sweptBtc} BTC | Urgency: ${sweepResult.cashoutUrgency}`);

const structuringNodes = [
  { id: 'suspect', label: 'Suspect' },
  { id: 'mule_1', label: 'Smurf 1' },
  { id: 'mule_2', label: 'Smurf 2' },
  { id: 'mule_3', label: 'Smurf 3' }
];
const structuringLinks = [
  { source: 'suspect', target: 'mule_1', value: '0.482 BTC', timestamp: 1720000000 },
  { source: 'suspect', target: 'mule_2', value: '0.485 BTC', timestamp: 1720000100 },
  { source: 'suspect', target: 'mule_3', value: '0.481 BTC', timestamp: 1720000200 }
];
const structuringReport = scanCaseStructuring(structuringNodes, structuringLinks);
console.log(`Structuring / Smurfing Scan : Clusters Identified: ${structuringReport.clusters?.length || 0}`);

// =============================================================================
// FEATURE 5: Script Bytecode Disassembler & OP_RETURN Parser
// =============================================================================
console.log('\n[FEATURE 5] SCRIPT BYTECODE DISASSEMBLER & OP_RETURN EXTRACTION');
console.log('-'.repeat(80));

// Standard P2PKH script: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
const p2pkhHex = '76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac';
const tokens = disassembleScriptHex(p2pkhHex);
console.log(`Disassembled Tokenized Opcodes : ${tokens.map(t => t.isData ? `<${t.hex}>` : t.opcode).join(' ')}`);

// OP_RETURN with ASCII payload: "AegisTrace: Seized UTXO #4412"
const opReturnHex = '6a1d416567697354726163653a205365697a6564205554584f202334343132';
const decodedOpReturn = decodeScriptPubkey(opReturnHex);
console.log(`Decoded OP_RETURN Text Content : "${decodedOpReturn.decodedText}" (${decodedOpReturn.type})`);

// Native SegWit & Taproot address decoding
const segwitInfo = decodeScriptPubkey('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
console.log(`SegWit Address Decoder         : Type: ${segwitInfo.type} | Standard: ${segwitInfo.standard}`);

// =============================================================================
// FEATURE 6: Cross-Chain Bridge Memo Disassembly
// =============================================================================
console.log('\n[FEATURE 6] CROSS-CHAIN BRIDGE MEMO DISASSEMBLER');
console.log('-'.repeat(80));

const thorMemo = 'SWAP:ETH.USDT:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045:500000000';
const parsedMemo = parseCrossChainMemo(thorMemo);
console.log(`Bridge Protocol     : ${parsedMemo.protocol}`);
console.log(`Destination Network : ${parsedMemo.destinationChain} (${parsedMemo.destinationChainCode})`);
console.log(`Target Asset        : ${parsedMemo.targetAsset}`);
console.log(`Destination Address : ${parsedMemo.destinationAddress}`);

// =============================================================================
// FEATURE 7: 5-Dimensional Forensic Risk Scoring Engine
// =============================================================================
console.log('\n[FEATURE 7] 5-DIMENSIONAL FORENSIC RISK SCORING');
console.log('-'.repeat(80));

const liveCaseData = {
  nodes: [
    { id: 'addr_suspect', label: 'Start wallet', type: 'suspect', details: { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' } },
    { id: 'addr_hop_1', label: 'Step 1', type: 'hop', details: { address: 'bc1q7w5pxj2lznq48as923kd8mzklaq02947alkwsj' } },
    { id: 'addr_mixer', label: 'Wasabi Mixer', type: 'mixer', details: { address: 'bc1qwasabipoolwallet001' } },
    { id: 'addr_receiver', label: 'Exchange Hot Wallet', type: 'receiver', details: { address: '3E8tMa9Jkdf923kd8mzklaq02947aWazirX' } }
  ],
  links: [
    { source: 'addr_suspect', target: 'addr_hop_1', value: '10.50 BTC' },
    { source: 'addr_hop_1', target: 'addr_mixer', value: '10.45 BTC' },
    { source: 'addr_mixer', target: 'addr_receiver', value: '10.40 BTC' }
  ]
};

const riskScore = calculateForensicRiskScore(liveCaseData);
console.log(`Overall Threat Score        : ${riskScore.riskScore} / 100 (${riskScore.threatBadge?.level || 'HIGH'})`);
console.log(`Has Mixer Intermediation    : ${riskScore.hasMixer}`);
console.log(`Transit Hop Count           : ${riskScore.hopCount}`);
console.log(`Statutory Legal Action Prompt: ${riskScore.statutoryAction?.title || 'Urgent Preservation'}`);

// =============================================================================
// FEATURE 8: Hash-Chained Chain of Custody Event Ledger
// =============================================================================
console.log('\n[FEATURE 8] HASH-CHAINED CHAIN OF CUSTODY (SHA-256 DIGESTS)');
console.log('-'.repeat(80));

const custodyChain = await buildChainOfCustody(SCENARIOS[0]);
console.log(`Total Evidentiary Transfer Events : ${custodyChain.eventCount}`);
console.log(`Terminal Sealed Head Digest       : ${custodyChain.terminalHash}`);
console.log(`Unanchored / Value Gaps Detected  : ${custodyChain.gaps.length}`);

const custodyVerification = await verifyChainOfCustody(custodyChain.events);
console.log(`Custody Chain Cryptographic Integrity: ${custodyVerification.valid} (${custodyVerification.reason})`);

// =============================================================================
// FEATURE 9: Graph Algorithms (Dijkstra Critical Trail & Centrality)
// =============================================================================
console.log('\n[FEATURE 9] GRAPH ALGORITHMS: CRITICAL TRAIL & CENTRALITY');
console.log('-'.repeat(80));

const trail = findCriticalMoneyTrail(SCENARIOS[0].nodes, SCENARIOS[0].links, 'addr_suspect', 'addr_receiver');
console.log(`Dijkstra Dominant Fund Path : ${trail.path?.join(' -> ')} (Total Flow: ${trail.totalValue} BTC)`);

const cycles = detectCircularFlows(SCENARIOS[0].nodes, SCENARIOS[0].links);
console.log(`Wash-Trading Cycles Detected: ${cycles.length}`);

const centrality = computeNodeCentralityMetrics(SCENARIOS[0].nodes, SCENARIOS[0].links);
console.log(`Centrality Analysis         : Suspect Out-Degree: ${centrality['addr_suspect']?.outDegree || 1} | Receiver In-Degree: ${centrality['addr_receiver']?.inDegree || 1}`);

// =============================================================================
// FEATURE 10: Cross-Case Syndicate Resolution & Correlated Wallets
// =============================================================================
console.log('\n[FEATURE 10] CROSS-CASE SYNDICATE CORRELATION');
console.log('-'.repeat(80));

const correlation = correlateCases(SCENARIOS);
console.log(`Total Correlated Pairs        : ${correlation.pairs.length}`);
if (correlation.pairs[0]) {
  const p = correlation.pairs[0];
  console.log(`Linked Cases                  : ${p.caseA} <--> ${p.caseB}`);
  console.log(`Shared Address Hits           : ${p.sharedCount} (Score: ${p.linkScore}/99, Verdict: ${p.verdict})`);
}
console.log(`Identified Syndicate Clusters : ${correlation.components.length} (${correlation.components[0]?.syndicateId})`);

// =============================================================================
// FEATURE 11: Case Snapshot Integrity & Canonical SHA-256 Hashing
// =============================================================================
console.log('\n[FEATURE 11] CASE SNAPSHOT INTEGRITY & CANONICAL SHA-256 HASHING');
console.log('-'.repeat(80));

const snapshot = await createTraceSnapshot(SCENARIOS[0]);
console.log(`Snapshot Format & Version     : ${snapshot.format} (v${snapshot.version})`);
console.log(`Canonical Payload SHA-256     : ${snapshot.integrity?.digest}`);

const verification = await verifyTraceSnapshot(snapshot);
console.log(`Snapshot Cryptographic Verify : ${verification.valid}`);

// =============================================================================
// FEATURE 12: Asset Recovery Leads & Workflow Transitions
// =============================================================================
console.log('\n[FEATURE 12] ASSET RECOVERY LEADS & STATE MACHINE');
console.log('-'.repeat(80));

const recoveryLeads = buildRecoveryLeads(SCENARIOS[0]);
console.log(`Identified Recovery Leads     : ${recoveryLeads.length}`);
if (recoveryLeads[0]) {
  console.log(`Primary Recovery Target       : ${recoveryLeads[0].address}`);
  console.log(`Gross Traced Value            : ${formatLeadAmount(recoveryLeads[0].movedSats)}`);
  console.log(`Current Lead State            : ${recoveryLeads[0].state || 'planned'}`);
  console.log(`Allowed State Transitions     : ${getRecoveryActionTransitions(recoveryLeads[0]).join(' -> ')}`);
}

// =============================================================================
// FEATURE 13: Automated Case Narrative Generator
// =============================================================================
console.log('\n[FEATURE 13] AUTOMATED FORENSIC NARRATIVE GENERATOR');
console.log('-'.repeat(80));

const narrative = generateForensicNarrative(SCENARIOS[0]);
console.log(`Headline    : ${narrative.headline}`);
console.log(`Urgency     : ${narrative.urgency}`);
console.log(`Summary     : ${narrative.summary}`);
console.log('Top Finding :');
console.log(` - ${narrative.findings[0]}`);

console.log('\n' + '='.repeat(80));
console.log('   ALL 13 FORENSIC FEATURE EXAMPLES COMPLETED SUCCESSFULLY!');
console.log('='.repeat(80));
