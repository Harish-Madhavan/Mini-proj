/**
 * Labeled-set accuracy harness: the honest answer to "does it trace correctly?"
 *
 * In-product confidence scores (per-hop and trace-level) measure how strongly
 * the heuristics agree — they are NOT measured accuracy. This module measures
 * actual correctness against ground-truth labels on real mainnet shapes:
 * the pizza purchase, the first-ever transaction (real pubkeys and spend
 * heights), the live-verified ransom splits, and definitional cases
 * (an output paying its own funder is change, by construction).
 *
 * Methodology: each case predicts payment / change / abstain from the same
 * scoreOutputHeuristics thresholds the product uses (>1.0 / <-1.0). Accuracy
 * is reported over COMMITTED decisions only, alongside coverage — otherwise a
 * model could fake 100% by abstaining on everything. The coverage floor in
 * accuracy.test.js guards that degenerate case.
 */

import { scoreOutputHeuristics } from './traceHeuristics';

function tx({ ins, outs, fee = 1000, vsize = 500, weight = 2000, height = 800000, time = 1700000000 }) {
  return {
    fee, vsize, weight,
    vin: ins.map(([addr, type, value, asm]) => ({
      sequence: 0xffffffff,
      prevout: {
        ...(addr ? { scriptpubkey_address: addr } : {}),
        ...(asm ? { scriptpubkey_asm: asm } : {}),
        scriptpubkey_type: type,
        value,
      },
    })),
    vout: outs.map(([addr, type, value, asm]) => ({
      ...(addr ? { scriptpubkey_address: addr } : {}),
      ...(asm ? { scriptpubkey_asm: asm } : {}),
      scriptpubkey_type: type,
      value,
    })),
    status: { confirmed: true, block_height: height, block_time: time },
  };
}

function spends(list) {
  return list.map(([spent, height, txid]) => ({
    spent,
    ...(height != null ? { status: { confirmed: true, block_height: height } } : {}),
    ...(txid ? { txid } : {}),
  }));
}

const PIZZA_FUNDER = '1XPTgDRhN8RFnzniWCddobD9iKZatrvH4';
const PIZZA_PAYEE = '17SkEw2md5avVNyYgj6RiXuQKNwkXaxFyQ';
const SATOSHI_KEY = '0411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3';
const HAL_KEY = '04ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84c';
const p2pkAsm = (key) => `OP_PUSHBYTES_65 ${key} OP_CHECKSIG`;

function pizzaTx(payee) {
  return tx({
    ins: Array.from({ length: 131 }, () => [PIZZA_FUNDER, 'p2pkh', 8000000000]),
    outs: [[payee, 'p2pkh', 1000000000000]],
    fee: 99000000, vsize: 23620, weight: 94480, height: 57043, time: 1274552191,
  });
}

function halTx() {
  return tx({
    ins: [[null, 'p2pk', 5000000000, p2pkAsm(SATOSHI_KEY)]],
    outs: [[null, 'p2pk', 1000000000, p2pkAsm(HAL_KEY)], [null, 'p2pk', 4000000000, p2pkAsm(SATOSHI_KEY)]],
    fee: 0, vsize: 275, weight: 1100, height: 170, time: 1231731025,
  });
}

export const LABELED_CASES = [
  {
    name: 'pizza payment (131-in-1-out, fresh round output)',
    expected: 'payment',
    tx: pizzaTx(PIZZA_PAYEE),
    outputIndex: 0,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[true, null, 'cca75078']]),
    seenAddresses: new Set([PIZZA_FUNDER]),
  },
  {
    name: 'self-consolidation (sole output back to funder)',
    expected: 'change',
    tx: pizzaTx(PIZZA_FUNDER),
    outputIndex: 0,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[true, null, null]]),
    seenAddresses: new Set([PIZZA_FUNDER]),
  },
  {
    name: 'unspent sole output (terminal holder)',
    expected: 'payment',
    tx: pizzaTx('1FreshUnspentAddrXyz123456789012'),
    outputIndex: 0,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[false, null, null]]),
    seenAddresses: new Set([PIZZA_FUNDER]),
  },
  {
    name: 'tempered single output (previously seen address)',
    expected: 'payment',
    tx: pizzaTx('1ReusedWalletAddrXyz12345678901'),
    outputIndex: 0,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[true, null, null]]),
    seenAddresses: new Set([PIZZA_FUNDER, '1ReusedWalletAddrXyz12345678901']),
  },
  {
    name: "Hal's 10 BTC (fresh key, 92k-block dwell)",
    expected: 'payment',
    tx: halTx(),
    outputIndex: 0,
    inputScriptTypes: ['Pay-to-PubKey (Legacy P2PK)'],
    outspends: spends([[true, 92240, 'ea44e972'], [true, 181, 'a16f3ce4']]),
    seenAddresses: new Set(),
  },
  {
    name: 'Satoshi 40 BTC change (reused key, 11-block sweep)',
    expected: 'change',
    tx: halTx(),
    outputIndex: 1,
    inputScriptTypes: ['Pay-to-PubKey (Legacy P2PK)'],
    outspends: spends([[true, 92240, 'ea44e972'], [true, 181, 'a16f3ce4']]),
    seenAddresses: new Set(),
  },
  {
    name: 'ransom peel (0.04% sliver, dwelled 4,001 blocks)',
    expected: 'payment',
    tx: tx({
      ins: [['16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy', 'p2pkh', 902796322]],
      outs: [
        ['1HG7gDBAYnPCJBC7eiwhX9dNRVi1c5naou', 'p2pkh', 329381],
        ['1P2SbiV5zKAwMTZH1VdExXM2sXRjkCeTsx', 'p2pkh', 902445824],
      ],
      fee: 21117, vsize: 225, weight: 900, height: 478829, time: 1501800000,
    }),
    outputIndex: 0,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[true, 482830, null], [true, 478837, null]]),
    seenAddresses: new Set(['16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy']),
  },
  {
    name: 'ransom change (99.96% remainder, swept in 8 blocks)',
    expected: 'change',
    tx: tx({
      ins: [['16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy', 'p2pkh', 902796322]],
      outs: [
        ['1HG7gDBAYnPCJBC7eiwhX9dNRVi1c5naou', 'p2pkh', 329381],
        ['1P2SbiV5zKAwMTZH1VdExXM2sXRjkCeTsx', 'p2pkh', 902445824],
      ],
      fee: 21117, vsize: 225, weight: 900, height: 478829, time: 1501800000,
    }),
    outputIndex: 1,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[true, 482830, null], [true, 478837, null]]),
    seenAddresses: new Set(['16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy']),
  },
  {
    name: 'companion peel (fast-swept sliver, genuinely ambiguous)',
    expected: 'abstain',
    tx: tx({
      ins: Array.from({ length: 36 }, () => ['12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw', 'p2pkh', 24257212]),
      outs: [
        ['1JC41YHmjKEcW1rLH6pmMWEFHkoNwSmhnC', 'p2pkh', 1227173],
        ['1FQQ86tMuvhQ4Ruyggbb8j7iaNfUZ69gpY', 'p2pkh', 871529348],
      ],
      fee: 505115, vsize: 11000, weight: 44000, height: 478795, time: 1501790000,
    }),
    outputIndex: 0,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[true, 478814, null], [true, 478825, null]]),
    seenAddresses: new Set(['12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw']),
  },
  {
    name: 'companion remainder (dominant share, fast sweep)',
    expected: 'change',
    tx: tx({
      ins: Array.from({ length: 36 }, () => ['12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw', 'p2pkh', 24257212]),
      outs: [
        ['1JC41YHmjKEcW1rLH6pmMWEFHkoNwSmhnC', 'p2pkh', 1227173],
        ['1FQQ86tMuvhQ4Ruyggbb8j7iaNfUZ69gpY', 'p2pkh', 871529348],
      ],
      fee: 505115, vsize: 11000, weight: 44000, height: 478795, time: 1501790000,
    }),
    outputIndex: 1,
    inputScriptTypes: ['Legacy (P2PKH)'],
    outspends: spends([[true, 478814, null], [true, 478825, null]]),
    seenAddresses: new Set(['12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw']),
  },
  {
    name: 'coinbase reward (no funder inputs at all)',
    expected: 'payment',
    tx: tx({
      ins: [],
      outs: [['bc1qminerrewardxyz12345678901234567890', 'v0_p2wpkh', 312500000]],
      fee: 0, vsize: 200, weight: 800, height: 840000, time: 1714000000,
    }),
    outputIndex: 0,
    inputScriptTypes: [],
    outspends: spends([[true, 840010, null]]),
    seenAddresses: new Set(),
  },
  {
    name: 'modern self-consolidation (5-in-1-out to own address)',
    expected: 'change',
    tx: tx({
      ins: Array.from({ length: 5 }, () => ['bc1qownwalletxyz12345678901234567890', 'v0_p2wpkh', 1000000]),
      outs: [['bc1qownwalletxyz12345678901234567890', 'v0_p2wpkh', 1234567]],
      fee: 1000, vsize: 500, weight: 2000, height: 800000, time: 1700000000,
    }),
    outputIndex: 0,
    inputScriptTypes: ['Native SegWit (v0 P2WPKH)'],
    outspends: spends([[true, 800010, null]]),
    seenAddresses: new Set(),
  },
];

function predict(result) {
  if (result.isPaymentCandidate) return 'payment';
  if (result.isChangeCandidate) return 'change';
  return 'abstain';
}

function perClassStats(rows, label) {
  const relevant = rows.filter((r) => r.expected === label);
  const predicted = rows.filter((r) => r.predicted === label);
  const truePositives = rows.filter((r) => r.predicted === label && r.expected === label);
  return {
    support: relevant.length,
    precision: predicted.length > 0 ? truePositives.length / predicted.length : 0,
    recall: relevant.length > 0 ? truePositives.length / relevant.length : 0,
  };
}

export function evaluateAccuracy(cases = LABELED_CASES) {
  const rows = cases.map((c) => {
    const r = scoreOutputHeuristics({
      tx: c.tx,
      outputIndex: c.outputIndex,
      inputScriptTypes: c.inputScriptTypes,
      outspends: c.outspends,
      seenAddresses: c.seenAddresses,
    });
    const predicted = predict(r);
    return {
      name: c.name,
      expected: c.expected,
      predicted,
      score: r.score,
      confidence: r.confidence,
      // Distance past the ±1.0 decision boundary. Small margins are fragile
      // calls worth watching — a correct verdict at 0.13 margin can flip on
      // any weight tweak, while one at 4.0 cannot.
      margin: predicted === 'abstain' ? 0 : Math.abs(r.score) - 1.0,
      correct: predicted === c.expected,
    };
  });
  const committed = rows.filter((r) => r.predicted !== 'abstain');
  const correct = committed.filter((r) => r.correct);
  const confCorrect = correct.map((r) => r.confidence);
  return {
    total: rows.length,
    committed: committed.length,
    correct: correct.length,
    accuracy: committed.length > 0 ? correct.length / committed.length : 0,
    coverage: rows.length > 0 ? committed.length / rows.length : 0,
    payment: perClassStats(rows, 'payment'),
    change: perClassStats(rows, 'change'),
    avgConfidenceCorrect: confCorrect.length > 0
      ? confCorrect.reduce((s, v) => s + v, 0) / confCorrect.length : null,
    misses: rows.filter((r) => r.predicted !== 'abstain' && !r.correct),
    abstentions: rows.filter((r) => r.predicted === 'abstain'),
    rows,
  };
}

export function formatAccuracyReport(report) {
  const line = (cols, widths) => cols.map((c, i) => String(c).padEnd(widths[i]).slice(0, widths[i])).join(' | ');
  const widths = [44, 9, 9, 8, 7, 7, 7];
  const out = [
    'ACCURACY (labeled mainnet shapes, offline)',
    line(['case', 'expected', 'result', 'score', 'conf', 'margin', 'verdict'], widths),
    '-'.repeat(102),
    ...report.rows.map((r) => line(
      [r.name, r.expected, r.predicted, r.score.toFixed(2), r.confidence.toFixed(2), r.margin.toFixed(2), r.correct ? 'OK' : 'WRONG'],
      widths
    )),
    '-'.repeat(102),
    `accuracy (committed): ${(report.accuracy * 100).toFixed(1)}%  ` +
    `coverage: ${(report.coverage * 100).toFixed(1)}% (${report.committed}/${report.total})  ` +
    `avg confidence when right: ${report.avgConfidenceCorrect != null ? report.avgConfidenceCorrect.toFixed(2) : 'n/a'}`,
    `payment: precision ${(report.payment.precision * 100).toFixed(0)}% / recall ${(report.payment.recall * 100).toFixed(0)}% (n=${report.payment.support})  ` +
    `change: precision ${(report.change.precision * 100).toFixed(0)}% / recall ${(report.change.recall * 100).toFixed(0)}% (n=${report.change.support})`,
  ];
  return out.join('\n');
}
