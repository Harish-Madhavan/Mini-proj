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
