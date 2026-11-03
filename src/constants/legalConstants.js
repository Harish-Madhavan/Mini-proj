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
  { label: 'CONFIDENTIAL — OFFICIAL USE ONLY', value: 'CONFIDENTIAL — OFFICIAL USE ONLY' },
  { label: 'PROSECUTION EXHIBIT', value: 'PROSECUTION EXHIBIT' },
  { label: 'RESTRICTED / LAW ENFORCEMENT', value: 'RESTRICTED / LAW ENFORCEMENT' },
  { label: 'COURT EVIDENCE SUBMISSION', value: 'COURT EVIDENCE SUBMISSION' }
];

export const DEFAULT_OFFICER_TITLE = 'Inspector R. Sharma (Investigating Officer)';
export const DEFAULT_FIR_NUMBER = 'NCB/NDPS/CR-104/2026';

export function generateSection67NoticeText({
  zonalUnit,
  firNumber,
  selectedExchange,
  caseTitle,
  depositAddress,
  currency,
  balance,
  officerRank,
  sigKey
}) {
  const generatedSigKey = sigKey || "NCB-CERT-F839A2";
  return `OFFICE OF THE NARCOTICS CONTROL BUREAU
MINISTRY OF HOME AFFAIRS, GOVERNMENT OF INDIA
ZONAL UNIT: ${(zonalUnit || 'NCB Headquarters').toUpperCase()}
CASE CRIME REF: ${firNumber || DEFAULT_FIR_NUMBER}

Date: ${new Date().toISOString().split('T')[0]}

TO,
Legal Compliance & Law Enforcement Relations Division
${selectedExchange || EXCHANGES[0]}

SUBJECT: Formal Notice under Section 67 of the Narcotic Drugs and Psychotropic Substances (NDPS) Act, 1985 - Immediate Statutory Request for Account & KYC Records.

Sir/Madam,

This office is conducting an active investigation involving suspicious cryptocurrency transactions (Case Title: ${caseTitle || 'Cryptocurrency Investigation'}). 

On-chain forensic blockchain tracing demonstrates that transaction value movement terminates directly at a deposit wallet address assigned to your platform:

Deposit Wallet Address: ${depositAddress}
Attributed Asset: ${currency} Protocol
Settled Traced Value: ${balance}

Pursuant to Section 67 of the NDPS Act, 1985, you are hereby directed to provide the following subscriber details associated with this deposit address within 48 hours of receipt:

1. Full Name, Date of Birth, Address, Government Photo ID (Aadhaar / PAN / Passport) submitted during KYC.
2. Connected Bank Account details (Bank Name, Account Number, IFSC) and Fiat Withdrawal History.
3. Complete IP Access logs with timestamps (UTC) for registration, logins, and deposit sessions.
4. Linked Email Address, Phone Number, and Device Identifiers.

Kindly treat this communication as CONFIDENTIAL under statutory law.

Issued By:
${officerRank || DEFAULT_OFFICER_TITLE}
Narcotics Control Bureau (NCB), Govt. of India
Digital Verification Key: SECURE-KEY-${generatedSigKey}`;
}

export function generateComplianceEmailTemplate({
  selectedExchange,
  firNumber,
  depositAddress,
  balance,
  officerRank
}) {
  const exInfo = EXCHANGE_DIRECTORY[selectedExchange] || { email: 'compliance@exchange.com' };
  const subject = encodeURIComponent(`[URGENT] Statutory Notice u/s 67 NDPS Act - Ref: ${firNumber || DEFAULT_FIR_NUMBER} - Deposit Addr: ${depositAddress.slice(0, 10)}...`);
  const body = encodeURIComponent(`To Nodal Compliance Officer,
${selectedExchange}

Please find attached statutory legal notice issued under Section 67 of NDPS Act, 1985 regarding Bitcoin deposit address: ${depositAddress} (Traced Value: ${balance}).

Crime Reference: ${firNumber || DEFAULT_FIR_NUMBER}
Investigating Officer: ${officerRank || DEFAULT_OFFICER_TITLE}

Kindly furnish KYC documents, registered bank accounts, and IP session access logs within statutory timeline.

Regards,
Narcotics Control Bureau (NCB)`);

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

