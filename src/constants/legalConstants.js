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

export function generateSection65BCertificateText({
  zonalUnit,
  firNumber,
  caseTitle,
  officerName,
  officerBadge,
  integrityHash,
  nodesCount,
  hopsCount,
  initialTxHash,
  targetExchange,
  depositAddress,
  totalSeizedBtc
}) {
  const dateStr = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toTimeString().split(' ')[0] + ' UTC';

  return `BEFORE THE SPECIAL COURT FOR NDPS CASES / SESSIONS COURT
GOVERNMENT OF INDIA, NARCOTICS CONTROL BUREAU
ZONAL UNIT: ${(zonalUnit || 'NCB Headquarters').toUpperCase()}

CERTIFICATE UNDER SECTION 65B OF THE INDIAN EVIDENCE ACT, 1872
(READ WITH SECTION 63 OF THE BHARATIYA SAKSHYA ADHINIYAM, 2023)
IN RESPECT OF COMPUTER-GENERATED ELECTRONIC BLOCKCHAIN EVIDENCE RECORDS

CRIME / FIR REFERENCE: ${firNumber || DEFAULT_FIR_NUMBER}
SPECIAL NDPS CASE TITLE: ${caseTitle || 'State (NCB) vs. Unidentified Cryptocurrency Narcotics Syndicate'}

I, ${officerName || 'Inspector R. Sharma'}, Badge No. ${officerBadge || 'NCB-84920-LE'}, presently deployed at ${zonalUnit || 'NCB Head Office, New Delhi'}, do hereby solemnly affirm and state on oath as under:

1. That I am the Investigating Officer / Authorized Cyber Forensic Examiner in the above-captioned matter and am fully conversant with the facts and electronic records of this case.

2. That on ${dateStr} at ${timeStr}, I extracted and cryptographically analyzed on-chain distributed public ledger data from the Bitcoin Blockchain Mainnet utilizing the AegisTrace Forensic Suite (Version 2.4.0-LE Secure Node).

3. PARTICULARS OF ELECTRONIC RECORD & COMPUTER SYSTEM:
   a. Computer Terminal: Secured NCB Cyber Forensic Workstation (SHA-256 Hashing Engine Active)
   b. Operating System: Windows NT 64-bit / Secure Isolated Sandbox
   c. Forensic Application: AegisTrace NCB Intelligence Engine (SIH-1675 Build)
   d. Cryptographic Integrity Hash: ${integrityHash || 'SHA256:AUTHENTICATED-EVIDENCE-RECORD'}
   e. Genesis / Suspect Transaction: ${initialTxHash || 'N/A'}
   f. Investigated Graph Scope: ${nodesCount || 0} Identified Nodes, ${hopsCount || 0} Validated Transaction Hops
   g. Terminal Settlement Endpoint: ${depositAddress || 'N/A'} [Entity: ${targetExchange || 'Domestic VASP'}]
   h. Attributed illicit Value: ${totalSeizedBtc || '0.0000 BTC'}

4. MANDATORY STATUTORY DECLARATION UNDER SECTION 65B(2) / SECTION 63(2):
   a. The computer output containing the transaction flow graph, UTXO outspend records, CIOH wallet clusters, and Section 67 subpoena requests was produced by the computer terminal during the period over which the computer was used regularly to store or process information for the purposes of cyber forensic investigation.
   b. Throughout the material part of the said period, the computer terminal was operating properly and there was no operational disruption or malfunction such as to affect the accuracy of the electronic blockchain records.
   c. The information contained in this electronic evidence record reproduces faithfully the distributed ledger records mined and confirmed on the decentralized Bitcoin mainnet.

5. CHAIN OF CUSTODY & DIGITAL INTEGRITY:
   The electronic exhibit file has been cryptographically sealed with the above SHA-256 cryptographic digest. Any alteration or modification to the underlying transaction records will invalidate the integrity hash.

DEPONENT:
Signature: ___________________________
Name: ${officerName || 'Inspector R. Sharma'}
Designation: Investigating Officer / Cyber Forensics Specialist
Narcotics Control Bureau (NCB), Ministry of Home Affairs, Govt. of India
Official Seal / Badge: ${officerBadge || 'NCB-84920-LE'}
Date: ${dateStr}
Place: ${(zonalUnit || 'Delhi').split(',')[0]}`;
}

