import { FORENSIC_CORPUS } from './forensicCorpus';

/**
 * Public-case research leads. These records are deliberately not labels and
 * must never be used to score a trace until their on-chain mapping is sourced.
 */
export const JUDICIAL_CASE_CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'colonial-pipeline-darkside-2021',
    title: 'Colonial Pipeline / DarkSide cryptocurrency seizure',
    status: 'SOURCE_LEAD',
    sources: Object.freeze([
      Object.freeze({
        title: 'U.S. Department of Justice seizure announcement',
        url: 'https://www.justice.gov/opa/pr/department-justice-seizes-23-million-cryptocurrency-paid-ransomware-extortionists-darkside',
        sourceType: 'government_announcement',
      }),
    ]),
    notes: 'The announcement is a research lead; it does not by itself establish exact transaction/output labels or the full traced path.',
    transactionIds: Object.freeze([]),
  }),
]);

const FIRST_PAYMENT_TXID = 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16';
const FIRST_PAYMENT_TX_URL = `https://www.bitcoin.com/explorer/btc/tx/${FIRST_PAYMENT_TXID}/`;
const NOTABLE_URL = 'https://www.bitcoin.com/explorer/btc/notable/';

/**
 * Bitcoin.com notable-address annotations, preserved with their source and
 * confidence scope. These are secondary-source labels, not court findings.
 */
export const BITCOIN_COM_NOTABLE_ADDRESSES = Object.freeze([
  Object.freeze({
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    label: 'Genesis address',
    attribution: 'Bitcoin.com describes this address as receiving the genesis block reward.',
    sourceUrl: NOTABLE_URL,
    transactionIds: Object.freeze(['4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b']),
    status: 'SOURCE_CORROBORATED',
  }),
  Object.freeze({
    address: '1Q2TWHE3GMdB6BZKafqwxXtWAWgFt5Jvm3',
    label: 'Hal Finney address',
    attribution: 'Bitcoin.com describes this as the first address to receive bitcoin from another person: 10 BTC in the first person-to-person transaction.',
    sourceUrl: NOTABLE_URL,
    transactionIds: Object.freeze([FIRST_PAYMENT_TXID]),
    status: 'SOURCE_CORROBORATED',
  }),
  Object.freeze({
    address: '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S',
    label: 'Address behind the first payment',
    attribution: 'Bitcoin.com describes this as the block 9 reward address that funded the first person-to-person transaction; the transaction returns 40 BTC to it as change.',
    sourceUrl: NOTABLE_URL,
    transactionIds: Object.freeze([FIRST_PAYMENT_TXID]),
    status: 'SOURCE_CORROBORATED',
  }),
]);

/**
 * A narrow source-corroborated historical benchmark: the Bitcoin.com explorer labels the
 * payment/change outputs, while confirmed Blockstream transaction and
 * outspend responses independently verify the transaction, output scripts,
 * values, block, public keys, and spend heights. P2PK address hashes are
 * reproducibly derived from those output public keys. This is not a legal
 * finding or a broad accuracy claim.
 */
export const TRACE_BENCHMARK_CASES = Object.freeze([
  Object.freeze({
    id: 'bitcoincom-first-person-to-person-payment',
    title: 'Satoshi-to-Hal first person-to-person payment',
    status: 'SOURCE_CORROBORATED',
    review: Object.freeze({
      reviewer: 'Repository source review',
      reviewedAt: '2026-11-03',
      method: 'Compared Bitcoin.com transaction detail and notable-address annotations with confirmed Blockstream transaction and outspends responses; independently derived legacy P2PKH addresses from the output public keys.',
    }),
    sources: Object.freeze([
      Object.freeze({
        id: 'bitcoincom-transaction',
        type: 'secondary_explorer',
        primary: false,
        title: 'Satoshi Nakamoto pays Hal Finney — Bitcoin.com Explorer',
        url: FIRST_PAYMENT_TX_URL,
        locator: 'Where the money went; Sent to; output rows 0 and 1',
        labelBasis: 'Published address mapping and payment/change roles',
      }),
      Object.freeze({
        id: 'bitcoincom-notable',
        type: 'secondary_historical_reference',
        primary: false,
        title: 'Notable Bitcoin transactions, blocks and addresses — Bitcoin.com Explorer',
        url: NOTABLE_URL,
        locator: 'Entries “Hal Finney’s address” and “The address behind the first payment”',
        labelBasis: 'Published historical address attribution',
      }),
    ]),
    chainEvidence: Object.freeze([Object.freeze({
      txid: FIRST_PAYMENT_TXID,
      provider: 'Blockstream Esplora API',
      endpoint: `https://blockstream.info/api/tx/${FIRST_PAYMENT_TXID}`,
      retrievedAt: '2026-11-03T14:09:17+05:30',
      blockHeight: 170,
      blockHash: '00000000d1145790a8694403d4063f323d499e655c83426834d4ce2f8dd4a2ee',
      canonicalResponseSha256: 'SHA256:6A0753DFED5837FF33DDF52E925F04083B13193F2DB87E99A4A7D833BB3A0D3D',
    }), Object.freeze({
      txid: FIRST_PAYMENT_TXID,
      provider: 'Blockstream Esplora API',
      endpoint: `https://blockstream.info/api/tx/${FIRST_PAYMENT_TXID}/outspends`,
      retrievedAt: '2026-11-03T14:15:00+05:30',
      canonicalResponseSha256: 'SHA256:380D7DD4E67656824EB80FCFDBD9E8D249CD57EBCAA65B47B277871FB7053438',
      spends: Object.freeze([
        Object.freeze({
          outputIndex: 0,
          spendingTxid: 'ea44e97271691990157559d0bdd9959e02790c34db6c006d779e82fa5aee708e',
          blockHeight: 92240,
          blockHash: '0000000000077430a94a5376bf2af42d4b1aebdecedfa9e4f7e3f0465a84d891',
          blockTime: 1289939967,
        }),
        Object.freeze({
          outputIndex: 1,
          spendingTxid: 'a16f3ce4dd5deb92d98ef5cf8afeaf0775ebca408f708b2146c4fb42b41e14be',
          blockHeight: 181,
          blockHash: '00000000dc55860c8a29c58d45209318fa9e9dc2c1833a7226d86bc465afc6e5',
          blockTime: 1231740133,
        }),
      ]),
    })]),
    expectedOutputs: Object.freeze([
      Object.freeze({
        txid: FIRST_PAYMENT_TXID,
        outputIndex: 0,
        address: '1Q2TWHE3GMdB6BZKafqwxXtWAWgFt5Jvm3',
        traceIdentifier: '1_P2PK_04ae1a62...6cd84c',
        outputScriptPubKey: '4104ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84cac',
        addressDerivation: 'Base58Check(version 0x00, RIPEMD160(SHA256(uncompressed P2PK public key)))',
        valueSats: 1000000000,
        expectedRole: 'payment',
        sourceIds: Object.freeze(['bitcoincom-transaction', 'bitcoincom-notable']),
      }),
      Object.freeze({
        txid: FIRST_PAYMENT_TXID,
        outputIndex: 1,
        address: '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S',
        traceIdentifier: '1_P2PK_0411db93...b412a3',
        outputScriptPubKey: '410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac',
        addressDerivation: 'Base58Check(version 0x00, RIPEMD160(SHA256(uncompressed P2PK public key)))',
        valueSats: 4000000000,
        expectedRole: 'change',
        sourceIds: Object.freeze(['bitcoincom-transaction', 'bitcoincom-notable']),
      }),
    ]),
  }),
]);

/**
 * Existing transaction references can seed future evaluations, but their
 * descriptions are not verified labels or evidence of ownership.
 */
export const TRACE_VALIDATION_CANDIDATES = Object.freeze(FORENSIC_CORPUS.map(entry =>
  Object.freeze({
    id: entry.key,
    title: entry.label,
    identifierType: entry.kind,
    identifier: entry.value,
    status: 'UNVERIFIED_REFERENCE',
    expectedOutputs: Object.freeze([]),
    sources: Object.freeze([]),
  })
));

/**
 * Only reviewed, source-backed records belong here. Empty means the
 * repository currently has no case that meets the benchmark evidence bar.
 */
export const JUDICIAL_GROUND_TRUTH = Object.freeze([]);

export function queryJudicialGroundTruth(identifier) {
  if (typeof identifier !== 'string' || !identifier.trim()) return null;
  const clean = identifier.trim().toLowerCase();
  for (const caseEntry of JUDICIAL_GROUND_TRUTH) {
    if (caseEntry.txid?.toLowerCase() === clean) return { type: 'TXID_MATCH', caseEntry };
    if (caseEntry.funderAddress?.toLowerCase() === clean) {
      return { type: 'FUNDER_MATCH', role: 'Funder', caseEntry };
    }
    for (const output of caseEntry.expectedOutputs || []) {
      if (output.txid?.toLowerCase() === clean) {
        return { type: 'TXID_MATCH', output, caseEntry };
      }
      if (output.address?.toLowerCase() === clean) {
        return { type: 'OUTPUT_MATCH', output, caseEntry };
      }
    }
  }
  return null;
}
