import { describe, it, expect } from 'vitest';
import {
  scoreOutputHeuristics,
  isRoundValue,
  extractTxPubkey,
  getIdentityKey,
  getSpendDwellBlocks,
  normalizeScriptKey,
  getFeeTier,
} from './traceHeuristics';

// Block 57043, May 2010 — the 10,000 BTC pizza purchase
// (a1075db5…fbf5d48d): 131 inputs from one funder, one fresh round output.
const PIZZA_TIME = 1274552191;
const PIZZA_FUNDER = '1XPTgDRhN8RFnzniWCddobD9iKZatrvH4';
const PIZZA_RECIPIENT = '17SkEw2md5avVNyYgj6RiXuQKNwkXaxFyQ';
const PIZZA_VALUE = 1000000000000; // 10,000 BTC

function pizzaShapedTx(outputAddr, blockTime = PIZZA_TIME) {
  return {
    txid: 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
    fee: 99000000,
    vsize: 23620,
    weight: 94480,
    vin: Array.from({ length: 131 }, () => ({
      sequence: 0xffffffff,
      prevout: { scriptpubkey_address: PIZZA_FUNDER, scriptpubkey_type: 'p2pkh', value: 8000000000 },
    })),
    vout: [{ scriptpubkey_address: outputAddr, scriptpubkey_type: 'p2pkh', value: PIZZA_VALUE }],
    status: { confirmed: true, block_height: 57043, block_time: blockTime },
  };
}

function scorePizza(outputAddr, { seen = null, blockTime = PIZZA_TIME } = {}) {
  const tx = pizzaShapedTx(outputAddr, blockTime);
  return scoreOutputHeuristics({
    tx,
    outputIndex: 0,
    inputScriptTypes: tx.vin.map(() => 'Legacy (P2PKH)'),
    outspends: [{ spent: true, txid: 'cca7507897abc89628f450e8b1e0c6fca4ec3f7b34cccf55f3f531c659ff4d79' }],
    seenAddresses: seen || new Set([PIZZA_FUNDER]),
  });
}

describe('end-receiver accuracy (pizza-tx grounded)', () => {
  it('classifies the pizza purchase output as a high-confidence payment', () => {
    const r = scorePizza(PIZZA_RECIPIENT);
    expect(r.isPaymentCandidate).toBe(true);
    expect(r.isChangeCandidate).toBe(false);
    expect(r.breakdown.identityScore).toBe(4);
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies a single output back to the funder as change', () => {
    const r = scorePizza(PIZZA_FUNDER);
    expect(r.isChangeCandidate).toBe(true);
    expect(r.isPaymentCandidate).toBe(false);
    expect(r.breakdown.identityScore).toBe(-4);
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('tempers single-output confidence for previously-seen addresses', () => {
    const seen = new Set([PIZZA_FUNDER, '1ReusedWalletAddrXXX']);
    const r = scorePizza('1ReusedWalletAddrXXX', { seen, blockTime: 1700000000 });
    expect(r.isPaymentCandidate).toBe(true);
    expect(r.breakdown.identityScore).toBe(1.5);
    expect(r.confidence).toBeLessThan(0.85);
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('gates the fee heuristic to the post-2015 fee market', () => {
    const mkTx = (blockTime) => ({
      fee: 22000, vsize: 220, weight: 880, // 100 sat/vB — "urgent" by modern tiers
      vin: [{ prevout: { scriptpubkey_address: 'bc1qin', scriptpubkey_type: 'v0_p2wpkh', value: 5000000 } }],
      vout: [
        { scriptpubkey_address: 'bc1qpay', scriptpubkey_type: 'v0_p2wpkh', value: 2000000 },
        { scriptpubkey_address: 'bc1qchg', scriptpubkey_type: 'v0_p2wpkh', value: 2978000 },
      ],
      status: { confirmed: true, block_time: blockTime },
    });
    const modern = scoreOutputHeuristics({
      tx: mkTx(1700000000), outputIndex: 0,
      inputScriptTypes: ['Native SegWit (v0 P2WPKH)'],
      outspends: [{ spent: true }], seenAddresses: new Set(),
    });
    const historic = scoreOutputHeuristics({
      tx: mkTx(PIZZA_TIME), outputIndex: 0,
      inputScriptTypes: ['Legacy (P2PKH)'],
      outspends: [{ spent: true }], seenAddresses: new Set(),
    });
    expect(modern.breakdown.feeScore).toBe(0.8);
    expect(historic.breakdown.feeScore).toBe(0);
  });

  it('no longer fingerprints many-in-one-out as consolidation change', () => {
    const r = scorePizza(PIZZA_RECIPIENT, { blockTime: 1700000000 });
    expect(r.breakdown.fingerprintScore).toBe(0);
  });

  it('keeps the classic 1-in-2-out peel fingerprint neutral', () => {
    const tx = {
      fee: 1000, vsize: 200, weight: 800,
      vin: [{ prevout: { scriptpubkey_address: 'bc1qin', scriptpubkey_type: 'v0_p2wpkh', value: 5000000 } }],
      vout: [
        { scriptpubkey_address: 'bc1qpay', scriptpubkey_type: 'v0_p2wpkh', value: 1000000 },
        { scriptpubkey_address: 'bc1qchg', scriptpubkey_type: 'v0_p2wpkh', value: 3999000 },
      ],
      status: { confirmed: true, block_time: 1700000000 },
    };
    const r = scoreOutputHeuristics({
      tx, outputIndex: 0,
      inputScriptTypes: ['Native SegWit (v0 P2WPKH)'],
      outspends: [{ spent: true }, { spent: true }], seenAddresses: new Set(),
    });
    expect(r.breakdown.fingerprintScore).toBe(0);
  });

  it('recognises the 10,000 BTC pizza amount as round', () => {
    expect(isRoundValue(PIZZA_VALUE)).toBe(true);
  });

  it('labels fee tiers across the shared fee bands', () => {
    expect(getFeeTier('1.5').label).toBe('Low fee');
    expect(getFeeTier('10').label).toBe('Average fee');
    expect(getFeeTier('50').label).toBe('High fee');
    expect(getFeeTier('200').label).toBe('Very high fee');
    expect(getFeeTier('N/A').label).toBe('unknown');
  });
});

// Block 170, Jan 2009 — the first-ever bitcoin transaction (f4184fc5…e9e16):
// Satoshi's 50 BTC coinbase P2PK input split into 10 BTC to Hal Finney and
// 40 BTC change reusing Satoshi's pubkey. No addresses exist anywhere.
const HAL_TIME = 1231731025;
const SATOSHI_PUBKEY = '0411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3';
const HAL_PUBKEY = '04ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84c';

function halShapedTx() {
  const p2pkOut = (pubkey, value) => ({
    scriptpubkey: `41${pubkey}ac`,
    scriptpubkey_asm: `OP_PUSHBYTES_65 ${pubkey} OP_CHECKSIG`,
    scriptpubkey_type: 'p2pk',
    value,
  });
  return {
    txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
    fee: 0,
    vsize: 275,
    weight: 1100,
    vin: [{
      sequence: 0xffffffff,
      prevout: {
        scriptpubkey: `41${SATOSHI_PUBKEY}ac`,
        scriptpubkey_asm: `OP_PUSHBYTES_65 ${SATOSHI_PUBKEY} OP_CHECKSIG`,
        scriptpubkey_type: 'p2pk',
        value: 5000000000,
      },
    }],
    vout: [p2pkOut(HAL_PUBKEY, 1000000000), p2pkOut(SATOSHI_PUBKEY, 4000000000)],
    status: { confirmed: true, block_height: 170, block_time: HAL_TIME },
  };
}

const HAL_OUTSPENDS = [
  { spent: true, txid: 'ea44e97271691990157559d0bdd9959e02790c34db6c006d779e82fa5aee708e', status: { confirmed: true, block_height: 92240 } },
  { spent: true, txid: 'a16f3ce4dd5deb92d98ef5cf8afeaf0775ebca408f708b2146c4fb42b41e14be', status: { confirmed: true, block_height: 181 } },
];

function scoreHal(outputIndex) {
  const tx = halShapedTx();
  return scoreOutputHeuristics({
    tx,
    outputIndex,
    inputScriptTypes: ['Pay-to-PubKey (Legacy P2PK)'],
    outspends: HAL_OUTSPENDS,
    seenAddresses: new Set(),
  });
}

describe('end-receiver accuracy (first-tx grounded)', () => {
  it('parses bare pubkeys from ASM and raw hex templates', () => {
    const asmObj = { scriptpubkey_asm: `OP_PUSHBYTES_65 ${HAL_PUBKEY} OP_CHECKSIG` };
    expect(extractTxPubkey(asmObj)).toBe(HAL_PUBKEY.toLowerCase());
    expect(extractTxPubkey({ scriptpubkey: `41${SATOSHI_PUBKEY}ac` })).toBe(SATOSHI_PUBKEY.toLowerCase());
    expect(extractTxPubkey({ scriptpubkey_address: 'bc1qxy2k' })).toBeNull();
    expect(extractTxPubkey(null)).toBeNull();
  });

  it('keys identities by address first, pubkey second', () => {
    expect(getIdentityKey({ scriptpubkey_address: 'bc1qxy2k' })).toBe('bc1qxy2k');
    expect(getIdentityKey({ scriptpubkey_asm: `OP_PUSHBYTES_65 ${HAL_PUBKEY} OP_CHECKSIG` }))
      .toBe(`pubkey:${HAL_PUBKEY.toLowerCase()}`);
    expect(getIdentityKey({})).toBeNull();
  });

  it('measures spend dwell in blocks, null when unknown', () => {
    const tx = { status: { block_height: 170 } };
    expect(getSpendDwellBlocks(tx, { status: { block_height: 181 } })).toBe(11);
    expect(getSpendDwellBlocks(tx, { status: { block_height: 92240 } })).toBe(92070);
    expect(getSpendDwellBlocks(tx, { status: { confirmed: false } })).toBeNull();
    expect(getSpendDwellBlocks({}, { status: { block_height: 181 } })).toBeNull();
  });

  it("classifies Hal's 10 BTC output as a payment (fresh key + 92k-block dwell)", () => {
    const r = scoreHal(0);
    expect(r.isPaymentCandidate).toBe(true);
    expect(r.isChangeCandidate).toBe(false);
    expect(r.breakdown.dwellBlocks).toBe(92070);
  });

  it('classifies the 40 BTC pubkey-reuse output as change (self + 11-block sweep)', () => {
    const r = scoreHal(1);
    expect(r.isChangeCandidate).toBe(true);
    expect(r.isPaymentCandidate).toBe(false);
    expect(r.breakdown.reuseScore).toBe(-5);
    expect(r.breakdown.dwellBlocks).toBe(11);
  });

  it('normalizes display-name and raw input script types to heuristic keys', () => {
    expect(normalizeScriptKey('Legacy (P2PKH)')).toBe('p2pkh');
    expect(normalizeScriptKey('Native SegWit (v0 P2WPKH)')).toBe('p2wpkh');
    expect(normalizeScriptKey('v0_p2wpkh')).toBe('p2wpkh');
    expect(normalizeScriptKey('p2pkh')).toBe('p2pkh');
    expect(normalizeScriptKey(null)).toBe('unknown');
  });

  it('matches same-type wallet scripts as change (taxonomy fix)', () => {
    const tx = {
      fee: 1000, vsize: 200, weight: 800,
      vin: [{ prevout: { scriptpubkey_address: 'bc1qin', scriptpubkey_type: 'v0_p2wpkh', value: 5000000 } }],
      vout: [
        { scriptpubkey_address: 'bc1qpay', scriptpubkey_type: 'v0_p2wpkh', value: 1000000 },
        { scriptpubkey_address: 'bc1qchg', scriptpubkey_type: 'v0_p2wpkh', value: 3999000 },
      ],
      status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
    };
    // Same-type change output alongside a DIFFERENT-type payment: H1 must fire -3
    const mixed = {
      ...tx,
      vout: [
        { scriptpubkey_address: '3payxxxx', scriptpubkey_type: 'p2sh', value: 1000000 },
        { scriptpubkey_address: 'bc1qchg', scriptpubkey_type: 'v0_p2wpkh', value: 3999000 },
      ],
    };
    const r = scoreOutputHeuristics({
      tx: mixed, outputIndex: 1,
      inputScriptTypes: ['Native SegWit (v0 P2WPKH)'],
      outspends: [{ spent: true }, { spent: true }], seenAddresses: new Set(),
    });
    expect(r.breakdown.scriptScore).toBe(-3);
  });

  it('splits the live-verified ransom peel (0.04% peel vs 99.96% change)', () => {
    // 2b22df65…: 9.028 BTC in, 329,381-sat peel + 9.024 BTC remainder.
    // Change swept 8 blocks later; peel dwelled 4,001 blocks.
    const tx = {
      fee: 21117, vsize: 225, weight: 900,
      vin: [{
        prevout: { scriptpubkey_address: '16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy', scriptpubkey_type: 'p2pkh', value: 902796322 },
      }],
      vout: [
        { scriptpubkey_address: '1HG7gDBAYnPCJBC7eiwhX9dNRVi1c5naou', scriptpubkey_type: 'p2pkh', value: 329381 },
        { scriptpubkey_address: '1P2SbiV5zKAwMTZH1VdExXM2sXRjkCeTsx', scriptpubkey_type: 'p2pkh', value: 902445824 },
      ],
      status: { confirmed: true, block_height: 478829, block_time: 1501800000 },
    };
    const base = {
      tx,
      inputScriptTypes: ['Legacy (P2PKH)'],
      seenAddresses: new Set(['16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy']),
    };
    const peel = scoreOutputHeuristics({
      ...base, outputIndex: 0,
      outspends: [
        { spent: true, status: { block_height: 482830 } },
        { spent: true, status: { block_height: 478837 } },
      ],
    });
    const change = scoreOutputHeuristics({
      ...base, outputIndex: 1,
      outspends: [
        { spent: true, status: { block_height: 482830 } },
        { spent: true, status: { block_height: 478837 } },
      ],
    });
    expect(change.isChangeCandidate).toBe(true);
    expect(change.breakdown.dwellBlocks).toBe(8);
    expect(peel.breakdown.dwellBlocks).toBe(4001);
    expect(peel.score).toBeGreaterThan(change.score);
    expect(peel.isChangeCandidate).toBe(false);
  });

  it('splits the companion sweep-split by dominant share (both branches fast)', () => {
    // 409803bb…: 36 same-wallet inputs, 8.73 BTC into 1.23M-sat peel +
    // 8.715 BTC remainder; both spent within 30 blocks.
    const tx = {
      fee: 505115, vsize: 11000, weight: 44000,
      vin: Array.from({ length: 36 }, () => ({
        prevout: { scriptpubkey_address: '12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw', scriptpubkey_type: 'p2pkh', value: 24257212 },
      })),
      vout: [
        { scriptpubkey_address: '1JC41YHmjKEcW1rLH6pmMWEFHkoNwSmhnC', scriptpubkey_type: 'p2pkh', value: 1227173 },
        { scriptpubkey_address: '1FQQ86tMuvhQ4Ruyggbb8j7iaNfUZ69gpY', scriptpubkey_type: 'p2pkh', value: 871529348 },
      ],
      status: { confirmed: true, block_height: 478795, block_time: 1501790000 },
    };
    const base = {
      tx,
      inputScriptTypes: ['Legacy (P2PKH)'],
      seenAddresses: new Set(['12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw']),
    };
    const spans = [
      { spent: true, status: { block_height: 478814 } },
      { spent: true, status: { block_height: 478825 } },
    ];
    const peel = scoreOutputHeuristics({ ...base, outputIndex: 0, outspends: spans });
    const change = scoreOutputHeuristics({ ...base, outputIndex: 1, outspends: spans });
    expect(change.isChangeCandidate).toBe(true);
    expect(peel.score).toBeGreaterThan(change.score);
    expect(peel.isChangeCandidate).toBe(false);
  });

  it('rewards chain-reused addresses and ignores one-time or unknown ones', () => {
    const tx = {
      fee: 2000, vsize: 250, weight: 1000,
      vin: [{ prevout: { scriptpubkey_address: 'bc1qsrcftx11111111111111111111111111', scriptpubkey_type: 'v0_p2wpkh', value: 5000000 } }],
      vout: [
        { scriptpubkey_address: 'bc1qpayftx11111111111111111111111111', scriptpubkey_type: 'v0_p2wpkh', value: 3000000 },
        { scriptpubkey_address: 'bc1qchgftx11111111111111111111111111', scriptpubkey_type: 'v0_p2wpkh', value: 1998000 },
      ],
      status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
    };
    const base = {
      tx, outputIndex: 0,
      inputScriptTypes: ['Native SegWit (v0 P2WPKH)'],
      outspends: [{ spent: true, status: { block_height: 800500 } }, { spent: true }],
      seenAddresses: new Set(),
    };
    const plain = scoreOutputHeuristics(base);
    expect(plain.breakdown.chainReuseScore).toBe(0);
    const reused = scoreOutputHeuristics({
      ...base,
      addressMeta: new Map([['bc1qpayftx11111111111111111111111111', { chain_stats: { funded_txo_count: 5 } }]]),
    });
    expect(reused.breakdown.chainReuseScore).toBe(1.2);
    expect(reused.score - plain.score).toBeCloseTo(0.86, 2);
    const once = scoreOutputHeuristics({
      ...base,
      addressMeta: new Map([['bc1qpayftx11111111111111111111111111', { chain_stats: { funded_txo_count: 1 } }]]),
    });
    expect(once.breakdown.chainReuseScore).toBe(0);
    expect(once.score).toBe(plain.score);
  });

  it('ranks dwelled payments above fast-swept change with no identity signal', () => {
    const tx = {
      fee: 1000, vsize: 200, weight: 800,
      vin: [{ prevout: { scriptpubkey_address: 'bc1qin', scriptpubkey_type: 'v0_p2wpkh', value: 5000000 } }],
      vout: [
        { scriptpubkey_address: 'bc1qfast', scriptpubkey_type: 'v0_p2wpkh', value: 1000000 },
        { scriptpubkey_address: 'bc1qslow', scriptpubkey_type: 'v0_p2wpkh', value: 1000000 },
      ],
      status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
    };
    const base = {
      tx, inputScriptTypes: ['Native SegWit (v0 P2WPKH)'], seenAddresses: new Set(),
    };
    const fast = scoreOutputHeuristics({
      ...base, outputIndex: 0,
      outspends: [{ spent: true, status: { block_height: 800010 } }, { spent: true }],
    });
    const dwelled = scoreOutputHeuristics({
      ...base, outputIndex: 1,
      outspends: [{ spent: true }, { spent: true, status: { block_height: 805000 } }],
    });
    expect(dwelled.score).toBeGreaterThan(fast.score);
    expect(fast.breakdown.dwellBlocks).toBe(10);
    expect(dwelled.breakdown.dwellBlocks).toBe(5000);
  });
});
