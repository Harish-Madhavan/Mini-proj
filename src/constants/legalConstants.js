export const EXCHANGE_DIRECTORY = {
  'WazirX (Zanmai Labs Pvt Ltd)': {
    entity: 'Zanmai Labs Private Limited',
    jurisdiction: 'India (registered)'
  },
  'CoinDCX (Neblio Technologies Pvt Ltd)': {
    entity: 'Neblio Technologies Private Limited',
    jurisdiction: 'India (registered)'
  },
  'Binance Holdings Ltd (Global compliance)': {
    entity: 'Binance Holdings Limited (Portal: Kodex)',
    jurisdiction: 'International'
  },
  'Coinswitch Kuber (Bitcipher Labs LLP)': {
    entity: 'Bitcipher Labs LLP',
    jurisdiction: 'India (registered)'
  },
  'ZebPay (Awlencan Innovations India Ltd)': {
    entity: 'Awlencan Innovations India Limited',
    jurisdiction: 'India (registered)'
  },
  'KuCoin (Requests)': {
    entity: 'KuCoin Liaison',
    jurisdiction: 'International / Seychelles'
  }
};

// Derived from the directory so names can never drift out of sync.
export const EXCHANGES = Object.keys(EXCHANGE_DIRECTORY);

export const ZONAL_UNITS = [
  { label: 'NCB Headquarters, Delhi', value: 'NCB Head Office, New Delhi', code: 'NCB/HQ/ND' },
  { label: 'Mumbai', value: 'NCB Mumbai Zonal Unit', code: 'NCB/MZU/MUM' },
  { label: 'Bengaluru', value: 'NCB Bengaluru Zonal Unit', code: 'NCB/BZU/BLR' },
  { label: 'Chennai', value: 'NCB Chennai Intelligence Cell', code: 'NCB/CIU/CH' }
];

export const WATERMARK_OPTIONS = [
  { label: 'DRAFT FOR REVIEW', value: 'DRAFT FOR REVIEW' },
  { label: 'INTERNAL WORKING COPY', value: 'INTERNAL WORKING COPY' },
  { label: 'INVESTIGATIVE LEAD - UNVERIFIED', value: 'INVESTIGATIVE LEAD - UNVERIFIED' }
];
export const DEFAULT_OFFICER_TITLE = '';
export const DEFAULT_FIR_NUMBER = '';

export const REQUEST_TYPES = Object.freeze({
  PRESERVATION: 'preservation',
  DISCLOSURE: 'disclosure',
  PRESERVATION_AND_DISCLOSURE: 'preservation_and_disclosure'
});

export function getRequestDraftReadiness({
  recipientEntity,
  endpointAddress,
  requestType,
  recordsScope,
  periodStart,
  periodEnd,
  legalBasisReference,
  recipientEmail,
  contactVerified,
  contactSourceReference,
  contactVerifiedAt
}) {
  const missing = [];
  if (!String(recipientEntity || '').trim()) missing.push('Enter the proposed recipient entity.');
  if (!Object.values(REQUEST_TYPES).includes(requestType)) missing.push('Select an intended request type.');
  if (!endpointAddress) missing.push('Select a case endpoint.');
  if (!String(recordsScope || '').trim()) missing.push('Describe the records sought.');
  if (!String(legalBasisReference || '').trim()) missing.push('Record the reviewer-approved legal process reference.');
  if (!periodStart || !periodEnd || periodEnd < periodStart) {
    missing.push('Provide a valid records period.');
  }
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipientEmail || '').trim());
  const contactValid = contactVerified === true &&
    String(contactSourceReference || '').trim().length > 0 &&
    Boolean(contactVerifiedAt) &&
    Number.isFinite(Date.parse(contactVerifiedAt)) &&
    Date.parse(contactVerifiedAt) <= Date.now();
  const emailMissing = [];
  if (!emailValid) emailMissing.push('Enter a valid recipient email address.');
  if (!contactValid) emailMissing.push('Independently verify the contact channel and record its source and date.');
  return {
    readyForReview: missing.length === 0,
    readyForEmailDraft: missing.length === 0 && emailMissing.length === 0,
    missing,
    emailMissing,
    requestType: Object.values(REQUEST_TYPES).includes(requestType) ? requestType : null
  };
}

export function generateRequestWorksheetText({
  requestType,
  zonalUnit,
  firNumber,
  selectedExchange,
  recipientEmail,
  caseTitle,
  endpointAddress,
  currency,
  balance,
  legalBasisReference,
  recordsScope,
  periodStart,
  periodEnd,
  contactSourceReference,
  contactVerifiedAt,
  evidenceReferences,
  officerRank
}) {
  const requestLabels = {
    [REQUEST_TYPES.PRESERVATION]: 'Preservation only',
    [REQUEST_TYPES.DISCLOSURE]: 'Disclosure request (requires approved lawful process)',
    [REQUEST_TYPES.PRESERVATION_AND_DISCLOSURE]: 'Preservation and disclosure (disclosure requires approved lawful process)'
  };
  const preservationNote = requestType === REQUEST_TYPES.PRESERVATION
    ? 'A preservation request asks that potentially relevant records be retained; it does not itself compel disclosure.'
    : 'Any disclosure request must be supported by process approved by the competent authority and legal counsel.';
  return `INTERNAL WORKSHEET — DRAFT FOR AUTHORIZED AND LEGAL REVIEW
NOT A SUBPOENA, STATUTORY NOTICE, COURT ORDER, OR APPROVED COMMUNICATION

Prepared: ${new Date().toISOString().split('T')[0]}
Proposed issuing unit: ${zonalUnit || 'Not supplied'}
Case reference: ${firNumber || 'Not supplied'}
Case title: ${caseTitle || 'Not supplied'}
Proposed recipient entity: ${selectedExchange || 'Not supplied'}
Proposed recipient email: ${recipientEmail || 'Not supplied'}
Intended request type: ${requestLabels[requestType] || 'Not selected'}

ADDRESS AND TRACE CONTEXT
Address under review: ${endpointAddress || 'Not selected'}
Asset recorded in case: ${currency || 'Not supplied'}
Recorded graph amount: ${balance || 'Not supplied'}

PROPOSED RECORDS SCOPE
Reviewer-entered scope: ${recordsScope || 'Not supplied'}
Relevant period: ${periodStart || 'Not supplied'} to ${periodEnd || 'Not supplied'}
Reviewer-approved process / authority reference: ${legalBasisReference || 'Not supplied'}
Related transaction/output references:
${Array.isArray(evidenceReferences) && evidenceReferences.length ? evidenceReferences.map(reference => `- ${reference}`).join('\n') : 'Not recorded in the selected case graph'}

CONTACT REVIEW
Contact marked independently verified by reviewer: ${contactVerifiedAt ? `Yes — ${contactVerifiedAt}` : 'No'}
Contact verification source/reference: ${contactSourceReference || 'Not supplied'}

Officer / reviewer: ${officerRank || 'Not supplied'}

${preservationNote}

All addresses, amounts, contacts, and references above are copied from case data or investigator input. A transaction trace does not establish address ownership, current control, an account relationship with the proposed recipient, or legal authority. The application does not authenticate contact details, determine the correct legal process, or submit this worksheet.

An authorized reviewer must verify the underlying source records, address-to-entity attribution, recipient and service channel, jurisdiction, scope, necessity, legal basis, and any required approvals before preparing or sending any request.

This worksheet has no legal effect and must not be represented as issued or served process.`;
}

export function generateComplianceEmailTemplate({
  recipientEmail,
  selectedExchange,
  firNumber,
  depositAddress,
  recordsScope,
  requestType,
  periodStart,
  periodEnd,
  legalBasisReference,
  evidenceReferences = []
}) {
  const cleanEmail = String(recipientEmail || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('A reviewer-verified recipient email address is required.');
  }
  const subject = encodeURIComponent(`[DRAFT FOR REVIEW] Records inquiry${firNumber ? ` - Ref: ${firNumber}` : ''}`);
  const requestLabels = {
    [REQUEST_TYPES.PRESERVATION]: 'Preservation only',
    [REQUEST_TYPES.DISCLOSURE]: 'Disclosure request (approved process required)',
    [REQUEST_TYPES.PRESERVATION_AND_DISCLOSURE]: 'Preservation and disclosure (approved process required for disclosure)'
  };
  const body = encodeURIComponent(`To ${selectedExchange || 'recipient'},

This is an unapproved draft for internal and legal review. It is not a statutory notice or legal process.

Case reference: ${firNumber || 'Not supplied'}
Address under review: ${depositAddress || 'Not supplied'}
Intended request type: ${requestLabels[requestType] || 'Not selected'}
Requested records: ${recordsScope || 'Not supplied'}
Relevant period: ${periodStart || 'Not supplied'} to ${periodEnd || 'Not supplied'}
Reviewer-approved process reference: ${legalBasisReference || 'Not supplied'}
Related transaction/output references: ${evidenceReferences.length ? evidenceReferences.join('; ') : 'Not recorded'}

The application has not verified that this address belongs to your organization. Independently verify the facts, authority, jurisdiction, scope, and contact channel before preparing or sending any communication. This email draft does not itself request, compel, or transmit records.

Draft prepared from AegisTrace case data.`);
  return `mailto:${cleanEmail}?subject=${subject}&body=${body}`;
}
export function generateEvidenceWorksheetText({
  caseId,
  caseTitle,
  officerName,
  officerBadge,
  integrityHash,
  nodesCount,
  hopsCount,
  initialTxHash,
  depositAddress,
  attributedAmount,
  identityEvidenceSource
}) {
  return `DRAFT EVIDENCE METADATA WORKSHEET — NOT A CERTIFICATE OR AFFIDAVIT

This worksheet is generated from application records. It does not certify the accuracy, provenance, admissibility, or legal sufficiency of those records. It contains no statutory declaration and must not be filed or represented as a signed certificate without independent review by the responsible authorized person and legal counsel.

APPLICATION RECORD (values below are not independently verified by this software)
Case ID: ${caseId || 'Not provided'}
Case title: ${caseTitle || 'Not provided'}
Officer name: ${officerName || 'Not provided'}
Officer badge/reference: ${officerBadge || 'Not provided'}
Primary transaction reference: ${initialTxHash || 'Not provided'}
Stored graph size: ${nodesCount ?? 0} nodes; ${hopsCount ?? 0} links (not a count of validated transactions)
Recorded endpoint address: ${depositAddress || 'Not established'}
Recorded endpoint attribution: ${identityEvidenceSource ? `Evidence source recorded as: ${identityEvidenceSource}; source contents and attribution are not verified by this software.` : 'Not established; an address or transaction pattern does not identify an owner or service.'}
Modeled trace amount: ${attributedAmount || 'Not established'} (not a confirmed seized or recoverable amount)

EVIDENCE PAYLOAD DIGEST
${integrityHash || 'Unavailable'}
The digest, when present, is SHA-256 over the complete canonical case data and report metadata snapshot described by this application. It detects changes to that snapshot; it does not prove that the source data is authentic, that an attribution is correct, or that an output is legally admissible.

INDEPENDENT REVIEW — TO BE COMPLETED OUTSIDE THIS TEMPLATE
Source records and retrieval method: __________________________________________
Collection date/time and time zone: ____________________________________________
Examiner and authority: _______________________________________________________
Computer/system details and operational status: _________________________________
Applicable statutory certificate requirements reviewed by: _______________________
Reviewer determination and supporting references: ______________________________

No oath, officer authority, workstation condition, chain-of-custody certification, exchange identity, seizure, or statutory compliance is asserted by this worksheet.`;
}
