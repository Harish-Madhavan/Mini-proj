import { validateBtcAddress } from './forensicUtils';

const TXID_PATTERN = /^[0-9a-f]{64}$/i;
const LINK_WARNING = 'Joint-input transaction is a reviewable co-spend link only; it does not establish common ownership or control.';

function canonicalAddress(address) {
  return /^bc1/i.test(address) ? address.toLowerCase() : address;
}

function nodeBitcoinAddresses(node) {
  const candidates = [
    node?.details?.address,
    node?.address,
    typeof node?.id === 'string' ? node.id.replace(/^(?:in|out)_/, '') : null,
  ];
  return [...new Set(candidates.filter(address =>
    typeof address === 'string' && validateBtcAddress(address).isValid
  ))];
}

export function getCaseBitcoinAddresses(caseData) {
  return [...new Set((caseData?.nodes || []).flatMap(nodeBitcoinAddresses))];
}

export function recordJointTransactionAcrossCases(cases, { txid, inputAddresses }) {
  if (!Array.isArray(cases)) {
    throw new TypeError('Saved cases are required to record joint-transaction evidence.');
  }
  if (!TXID_PATTERN.test(txid || '') || !Array.isArray(inputAddresses)) {
    throw new TypeError('A valid transaction ID and input address list are required.');
  }

  const validInputs = [...new Set(inputAddresses.filter(address =>
    typeof address === 'string' && validateBtcAddress(address).isValid
  ).map(canonicalAddress))];
  if (validInputs.length < 2) {
    return {
      cases,
      linkedCaseIds: [],
      reason: 'At least two valid input addresses are required.',
      matchedAddressCount: 0,
      unmatchedAddresses: validInputs,
    };
  }

  const addressesByCase = new Map((cases || []).map(caseData => {
    const addresses = [...new Set(getCaseBitcoinAddresses(caseData)
      .filter(address => validInputs.includes(canonicalAddress(address))))];
    return [caseData.id, addresses];
  }));
  const linkedCaseIds = [...addressesByCase]
    .filter(([, addresses]) => addresses.length > 0)
    .map(([caseId]) => caseId);
  const linkedAddressSet = new Set(linkedCaseIds.flatMap(caseId => addressesByCase.get(caseId)));
  const matchedInputs = new Set([...linkedAddressSet].map(canonicalAddress));
  const unmatchedAddresses = validInputs.filter(address => !matchedInputs.has(address));

  if (linkedCaseIds.length < 2) {
    return {
      cases,
      linkedCaseIds: [],
      reason: `Matched ${matchedInputs.size} of ${validInputs.length} distinct inputs across ${linkedCaseIds.length} saved case(s). Clustering imports do not change saved case graphs.`,
      matchedAddressCount: matchedInputs.size,
      unmatchedAddresses,
      matchingCaseIds: linkedCaseIds,
    };
  }
  if (linkedAddressSet.size < 2) {
    return {
      cases,
      linkedCaseIds: [],
      reason: `Matched only ${matchedInputs.size} distinct transaction input address across ${linkedCaseIds.length} saved case(s); at least two distinct inputs must be represented.`,
      matchedAddressCount: matchedInputs.size,
      unmatchedAddresses,
      matchingCaseIds: linkedCaseIds,
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

export function recordManualCaseAssociation(cases, { caseAId, caseBId, transactionIds, rationale }) {
  if (!Array.isArray(cases)) {
    throw new TypeError('Saved cases are required to record a manual case association.');
  }
  const caseA = cases.find(caseData => caseData.id === caseAId);
  const caseB = cases.find(caseData => caseData.id === caseBId);
  if (!caseA || !caseB || caseAId === caseBId) {
    return { success: false, cases, reason: 'Choose two different saved cases.' };
  }

  const cleanTransactionIds = [...new Set((Array.isArray(transactionIds) ? transactionIds : [])
    .map(txid => typeof txid === 'string' ? txid.trim().toLowerCase() : '')
    .filter(Boolean))];
  if (!cleanTransactionIds.length || cleanTransactionIds.length > 20 ||
      cleanTransactionIds.some(txid => !TXID_PATTERN.test(txid))) {
    return { success: false, cases, reason: 'Enter 1 to 20 valid 64-character transaction IDs.' };
  }

  const cleanRationale = typeof rationale === 'string' ? rationale.trim() : '';
  if (!cleanRationale || cleanRationale.length > 2000) {
    return { success: false, cases, reason: 'Enter a rationale (up to 2,000 characters).' };
  }

  const [firstCaseId, secondCaseId] = [caseAId, caseBId].sort();
  const hasDuplicate = [caseA, caseB].every(caseData =>
    (caseData.manualCaseAssociations || []).some(association =>
      association.caseAId === firstCaseId &&
      association.caseBId === secondCaseId &&
      [...(association.transactionIds || [])].sort().join('|') === [...cleanTransactionIds].sort().join('|') &&
      association.rationale === cleanRationale
    )
  );
  if (hasDuplicate) {
    return { success: true, cases, duplicate: true, linkedCaseIds: [firstCaseId, secondCaseId] };
  }

  const recordedAt = new Date().toISOString();
  const association = {
    associationId: `${firstCaseId}:${secondCaseId}:${recordedAt}`,
    caseAId: firstCaseId,
    caseBId: secondCaseId,
    transactionIds: cleanTransactionIds,
    rationale: cleanRationale,
    recordedAt,
    classification: 'investigator-reported; not independently verified',
    warning: 'Manual case association and transaction references are investigator-reported; they do not establish an on-chain link, common ownership, or control.',
  };
  const updatedCases = cases.map(caseData =>
    caseData.id === firstCaseId || caseData.id === secondCaseId
      ? {
          ...caseData,
          manualCaseAssociations: [
            ...(Array.isArray(caseData.manualCaseAssociations) ? caseData.manualCaseAssociations : []),
            association,
          ],
        }
      : caseData
  );
  return {
    success: true,
    cases: updatedCases,
    duplicate: false,
    linkedCaseIds: [firstCaseId, secondCaseId],
    association,
  };
}
