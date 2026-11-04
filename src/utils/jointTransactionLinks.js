import { validateBtcAddress } from './forensicUtils';

const TXID_PATTERN = /^[0-9a-f]{64}$/i;
const LINK_WARNING = 'Joint-input transaction is a reviewable co-spend link only; it does not establish common ownership or control.';

export function recordJointTransactionAcrossCases(cases, { txid, inputAddresses }) {
  if (!Array.isArray(cases)) {
    throw new TypeError('Saved cases are required to record joint-transaction evidence.');
  }
  if (!TXID_PATTERN.test(txid || '') || !Array.isArray(inputAddresses)) {
    throw new TypeError('A valid transaction ID and input address list are required.');
  }

  const validInputs = [...new Set(inputAddresses.filter(address =>
    typeof address === 'string' && validateBtcAddress(address).isValid
  ))];
  if (validInputs.length < 2) {
    return { cases, linkedCaseIds: [], reason: 'At least two valid input addresses are required.' };
  }

  const inputSet = new Set(validInputs);
  const addressesByCase = new Map((cases || []).map(caseData => {
    const addresses = [...new Set((caseData.nodes || [])
      .map(node => node.details?.address)
      .filter(address => inputSet.has(address)))];
    return [caseData.id, addresses];
  }));
  const linkedCaseIds = [...addressesByCase]
    .filter(([, addresses]) => addresses.length > 0)
    .map(([caseId]) => caseId);
  const linkedAddressSet = new Set(linkedCaseIds.flatMap(caseId => addressesByCase.get(caseId)));

  if (linkedCaseIds.length < 2) {
    return {
      cases,
      linkedCaseIds: [],
      reason: 'The transaction inputs do not match addresses in at least two saved cases.',
    };
  }
  if (linkedAddressSet.size < 2) {
    return {
      cases,
      linkedCaseIds: [],
      reason: 'At least two distinct transaction input addresses must match saved cases.',
    };
  }

  const recordedAt = new Date().toISOString();
  const updatedCases = cases.map(caseData => {
    const caseAddresses = addressesByCase.get(caseData.id) || [];
    if (caseAddresses.length === 0) return caseData;

    const priorEvidence = Array.isArray(caseData.jointTransactionEvidence) ? caseData.jointTransactionEvidence : [];
    const existing = priorEvidence.find(entry => entry.txid?.toLowerCase() === txid.toLowerCase());
    const evidence = {
      txid: txid.toLowerCase(),
      inputAddresses: [...new Set([...(existing?.inputAddresses || []), ...caseAddresses])],
      recordedAt: existing?.recordedAt || recordedAt,
      method: 'common-input co-spend',
      warning: LINK_WARNING,
    };
    return {
      ...caseData,
      jointTransactionEvidence: [
        ...priorEvidence.filter(entry => entry.txid?.toLowerCase() !== txid.toLowerCase()),
        evidence,
      ],
    };
  });

  return { cases: updatedCases, linkedCaseIds, reason: null };
}
