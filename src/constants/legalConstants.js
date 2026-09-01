export const EXCHANGES = [
  'WazirX (Zanmai Labs Pvt Ltd)',
  'CoinDCX (Neblio Technologies Pvt Ltd)',
  'Binance Holdings Ltd (Global LE Compliance)',
  'Coinswitch Kuber (Bitcipher Labs LLP)',
  'ZebPay (Awlencan Innovations India Ltd)',
  'KuCoin (LE Requests Division)'
];

export const EXCHANGE_DIRECTORY = {
  'WazirX (Zanmai Labs Pvt Ltd)': {
    entity: 'Zanmai Labs Private Limited',
    email: 'lawenforcement@wazirx.com',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (FIU-IND Registered)'
  },
  'CoinDCX (Neblio Technologies Pvt Ltd)': {
    entity: 'Neblio Technologies Private Limited',
    email: 'compliance@coindcx.com',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (FIU-IND Registered)'
  },
  'Binance Holdings Ltd (Global LE Compliance)': {
    entity: 'Binance Holdings Limited (LE Portal: Kodex)',
    email: 'case-response@binance.com',
    sla: '48 - 72 Hours',
    jurisdiction: 'International / FIU-IND Registered'
  },
  'Coinswitch Kuber (Bitcipher Labs LLP)': {
    entity: 'Bitcipher Labs LLP',
    email: 'le-support@coinswitch.co',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (FIU-IND Registered)'
  },
  'ZebPay (Awlencan Innovations India Ltd)': {
    entity: 'Awlencan Innovations India Limited',
    email: 'lawenforcement@zebpay.com',
    sla: '24 - 48 Hours',
    jurisdiction: 'India (FIU-IND Registered)'
  },
  'KuCoin (LE Requests Division)': {
    entity: 'KuCoin Law Enforcement Liaison',
    email: 'le-compliance@kucoin.com',
    sla: '48 - 72 Hours',
    jurisdiction: 'International / Seychelles'
  }
};

export const ZONAL_UNITS = [
  { label: 'NCB Headquarters, Delhi', value: 'NCB Head Office, New Delhi', code: 'NCB/HQ/ND' },
  { label: 'Mumbai Zonal Unit (MZU)', value: 'NCB Mumbai Zonal Unit', code: 'NCB/MZU/MUM' },
  { label: 'Bengaluru Zonal Unit (BZU)', value: 'NCB Bengaluru Zonal Unit', code: 'NCB/BZU/BLR' },
  { label: 'Chennai Intelligence Cell (CIU)', value: 'NCB Chennai Intelligence Cell', code: 'NCB/CIU/CH' }
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
