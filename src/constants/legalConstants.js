export const EXCHANGE_DIRECTORY = {
  'WazirX (Zanmai Labs Pvt Ltd)': {
    entity: 'Zanmai Labs Private Limited',
    email: 'lawenforcement@wazirx.com',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (registered)'
  },
  'CoinDCX (Neblio Technologies Pvt Ltd)': {
    entity: 'Neblio Technologies Private Limited',
    email: 'compliance@coindcx.com',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (registered)'
  },
  'Binance Holdings Ltd (Global compliance)': {
    entity: 'Binance Holdings Limited (Portal: Kodex)',
    email: 'case-response@binance.com',
    sla: '48 - 72 Hours',
    jurisdiction: 'International'
  },
  'Coinswitch Kuber (Bitcipher Labs LLP)': {
    entity: 'Bitcipher Labs LLP',
    email: 'le-support@coinswitch.co',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (registered)'
  },
  'ZebPay (Awlencan Innovations India Ltd)': {
    entity: 'Awlencan Innovations India Limited',
    email: 'lawenforcement@zebpay.com',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (registered)'
  },
  'KuCoin (Requests)': {
    entity: 'KuCoin Liaison',
    email: 'le-compliance@kucoin.com',
    sla: '48 - 72 Hours',
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

export function generateSection67NoticeText({
  zonalUnit,
  firNumber,
  selectedExchange,
  caseTitle,
  depositAddress,
  currency,
  balance,
  officerRank,
}) {
  return `DRAFT REQUEST WORKSHEET - FOR AUTHORIZED AND LEGAL REVIEW ONLY
NOT A STATUTORY NOTICE, ORDER, CERTIFICATE, OR APPROVED COMMUNICATION

Prepared: ${new Date().toISOString().split('T')[0]}
Proposed issuing unit: ${zonalUnit || 'Not supplied'}
Case reference: ${firNumber || 'Not supplied'}
Case title: ${caseTitle || 'Not supplied'}
Proposed recipient: ${selectedExchange || 'Not supplied'}

Address under review: ${depositAddress || 'Not supplied'}
Asset recorded in case: ${currency || 'Not supplied'}
Recorded graph amount: ${balance || 'Not supplied'}

These values are copied from application case data. A transaction trace does not establish that this address belongs to the proposed recipient, that funds are currently available, or that any person or service is involved.

Before preparing or issuing a communication, an authorized reviewer must independently verify the source records, destination attribution, case authority, jurisdiction, requested records, applicable legal basis, and approved contact channel.

Reviewer-supplied legal basis and approved request text: [complete after legal review]
Reviewer: ${officerRank || 'Not supplied'}
Digital signature or certificate: Not provided by this application

This worksheet has no legal effect and must not be represented as an issued notice.`;
}

export function generateComplianceEmailTemplate({
  selectedExchange,
  firNumber,
  depositAddress,
  balance,
  officerRank
}) {
  const exInfo = EXCHANGE_DIRECTORY[selectedExchange] || { email: 'compliance@example.invalid' };
  const subject = encodeURIComponent(`[DRAFT FOR REVIEW] Cryptocurrency transaction lead${firNumber ? ` - Ref: ${firNumber}` : ''}`);
  const body = encodeURIComponent(`To ${selectedExchange || 'recipient'},

This is an unapproved draft for internal and legal review. It is not a statutory notice or a verified attribution.

Case reference: ${firNumber || 'Not supplied'}
Reviewer: ${officerRank || 'Not supplied'}
Address under review: ${depositAddress || 'Not supplied'}
Amount recorded in case: ${balance || 'Not supplied'}

The application has not verified that this address belongs to your organization. This draft makes no records request. Independently verify the facts, authority, and contact channel before preparing any communication.

Draft prepared from AegisTrace case data.`);
  return `mailto:${exInfo.email}?subject=${subject}&body=${body}`;
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

