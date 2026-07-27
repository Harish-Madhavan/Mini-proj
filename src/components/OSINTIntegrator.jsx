import React, { useState } from 'react';
import { 
  Globe, 
  MapPin, 
  FileSignature, 
  Search, 
  Clipboard, 
  AlertTriangle,
  Download
} from 'lucide-react';

export default function OSINTIntegrator({ activeCase }) {
  const [selectedExchange, setSelectedExchange] = useState('WazirX (Zanmai Labs Pvt Ltd)');
  const [firNumber, setFirNumber] = useState('NCB/NDPS/CR-104/2026');
  const [zonalUnit, setZonalUnit] = useState('NCB Headquarters, New Delhi');
  const [officerRank, setOfficerRank] = useState('Inspector R. Sharma (Investigating Officer)');

  const [isQueryingOSINT, setIsQueryingOSINT] = useState(false);
  const [osintData, setOsintData] = useState(null);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  const receiverNode = activeCase.nodes.find(n => n.type === 'receiver');
  const suspectNode = activeCase.nodes.find(n => n.type === 'suspect');

  const handleQueryOSINT = () => {
    setIsQueryingOSINT(true);
    setOsintData(null);
    setTimeout(() => {
      setIsQueryingOSINT(false);
      
      const sigKey = Math.random().toString(36).substring(2, 10).toUpperCase();

      setOsintData({
        sigKey,
        ipGeolocations: [
          { ip: suspectNode?.details?.address ? "P2P Broadcast Node" : "103.241.12.89", org: "Public Node Relay", loc: "Attributed P2P Peer", type: "Origin Broadcast IP" },
          { ip: receiverNode?.details?.address ? "Exchange Gateway IP" : "122.161.49.5", org: "Compliance Gateway", loc: "Exchange Endpoint", type: "Deposit Session IP" }
        ]
      });
    }, 800);
  };

  const generateSubpoenaText = () => {
    if (!receiverNode) return "";
    const generatedSigKey = osintData?.sigKey || "NCB-CERT-F839A2";
    return `OFFICE OF THE NARCOTICS CONTROL BUREAU
MINISTRY OF HOME AFFAIRS, GOVERNMENT OF INDIA
ZONAL UNIT: ${zonalUnit.toUpperCase()}
CASE CRIME REF: ${firNumber}

Date: ${new Date().toISOString().split('T')[0]}

TO,
Legal Compliance & Law Enforcement Relations Division
${selectedExchange}

SUBJECT: Formal Notice under Section 67 of the Narcotic Drugs and Psychotropic Substances (NDPS) Act, 1985 - Immediate Statutory Request for Account & KYC Records.

Sir/Madam,

This office is conducting an active investigation involving suspicious cryptocurrency transactions (Case Title: ${activeCase.title}). 

On-chain forensic blockchain tracing demonstrates that transaction value movement terminates directly at a deposit wallet address assigned to your platform:

Deposit Wallet Address: ${receiverNode.details.address}
Attributed Asset: ${activeCase.currency} Protocol
Settled Traced Value: ${receiverNode.balance}

Pursuant to Section 67 of the NDPS Act, 1985, you are hereby directed to provide the following subscriber details associated with this deposit address within 48 hours of receipt:

1. Full Name, Date of Birth, Address, Government Photo ID (Aadhaar / PAN / Passport) submitted during KYC.
2. Connected Bank Account details (Bank Name, Account Number, IFSC) and Fiat Withdrawal History.
3. Complete IP Access logs with timestamps (UTC) for registration, logins, and deposit sessions.
4. Linked Email Address, Phone Number, and Device Identifiers.

Kindly treat this communication as CONFIDENTIAL under statutory law.

Issued By:
${officerRank}
Narcotics Control Bureau (NCB), Govt. of India
Digital Verification Key: SECURE-KEY-${generatedSigKey}`;
  };

  const handleCopySubpoena = () => {
    navigator.clipboard.writeText(generateSubpoenaText());
    alert("Subpoena notice copied to clipboard.");
  };

  const handleDownloadSubpoena = () => {
    const text = generateSubpoenaText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NCB-Section67-Notice-${activeCase.id.toUpperCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      
      {/* On-Chain / Network IP Lookup */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Globe style={{ color: 'var(--primary)' }} size={18} /> Network Node & IP Cross-Reference
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Inspect peer-to-peer network broadcast origin nodes and exchange gateway connection logs for the selected transaction trace.
        </p>

        <button 
          onClick={handleQueryOSINT}
          disabled={isQueryingOSINT}
          style={{
            padding: '0.6rem 1rem',
            borderRadius: '6px',
            border: '1px solid var(--primary)',
            backgroundColor: 'rgba(2, 132, 199, 0.05)',
            color: 'var(--primary)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem'
          }}
        >
          <Search size={16} /> 
          {isQueryingOSINT ? "Inspecting network node attributes..." : "Query Network Attributes"}
        </button>

        {osintData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase' }}>Network IP Routing</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {osintData.ipGeolocations.map((ip, i) => (
                <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <strong className="mono-addr">{ip.ip}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{ip.type}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <MapPin size={12} style={{ color: '#ef4444' }} /> {ip.loc} | {ip.org}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Subpoena Draft Generator */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileSignature style={{ color: 'var(--primary)' }} size={18} /> Section 67 NDPS Legal Notice Generator
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Generate a formal law enforcement request notice under Section 67 NDPS Act 1985 for the identified exchange deposit endpoint.
        </p>

        {/* Editable Form Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Exchange / VASP</label>
            <select 
              value={selectedExchange} 
              onChange={(e) => setSelectedExchange(e.target.value)}
              style={{
                padding: '0.45rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: '#0f172a',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '0.8rem'
              }}
            >
              <option value="WazirX (Zanmai Labs Pvt Ltd)">WazirX (Zanmai Labs)</option>
              <option value="CoinDCX (Neblio Technologies Pvt Ltd)">CoinDCX (Neblio Tech)</option>
              <option value="CoinSwitch (Peepal Co)">CoinSwitch Kuber</option>
              <option value="Bitbns (Inovio Ventures)">Bitbns</option>
              <option value="Giottus Technologies">Giottus</option>
              <option value="Binance Global Law Enforcement Division">Binance Global</option>
              <option value="Bybit Law Enforcement Portal">Bybit Compliance</option>
              <option value="OKX Law Enforcement Relations">OKX</option>
              <option value="KuCoin Legal Compliance">KuCoin</option>
              <option value="Kraken Legal Department">Kraken Compliance</option>
              <option value="Gate.io Compliance Team">Gate.io</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FIR / Crime Ref No.</label>
            <input 
              type="text" 
              value={firNumber} 
              onChange={(e) => setFirNumber(e.target.value)}
              style={{
                padding: '0.45rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: '#0f172a',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '0.8rem'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Issuing Zonal Unit</label>
            <input 
              type="text" 
              value={zonalUnit} 
              onChange={(e) => setZonalUnit(e.target.value)}
              style={{
                padding: '0.45rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: '#0f172a',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '0.8rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Officer Name & Rank</label>
            <input 
              type="text" 
              value={officerRank} 
              onChange={(e) => setOfficerRank(e.target.value)}
              style={{
                padding: '0.45rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: '#0f172a',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '0.8rem'
              }}
            />
          </div>
        </div>

        {receiverNode ? (
          <>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                value={generateSubpoenaText()}
                readOnly
                style={{
                  width: '100%',
                  height: '200px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: '#080c14',
                  color: 'var(--text-primary)',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: '1.4'
                }}
              />
              <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleDownloadSubpoena}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                  title="Download Notice as Text file"
                >
                  <Download size={12} /> Download
                </button>

                <button
                  onClick={handleCopySubpoena}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                  title="Copy Subpoena Notice"
                >
                  <Clipboard size={12} /> Copy Text
                </button>
              </div>
            </div>

            <div style={{ 
              backgroundColor: 'rgba(245, 158, 11, 0.05)', 
              border: '1px solid var(--risk-medium)', 
              borderRadius: '6px', 
              padding: '0.6rem 0.8rem', 
              fontSize: '0.8rem', 
              display: 'flex', 
              alignItems: 'flex-start',
              gap: '0.5rem' 
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--risk-medium)', flexShrink: 0 }} />
              <div style={{ color: 'var(--text-secondary)' }}>
                Notices under Section 67 NDPS Act must be signed by an authorized officer prior to dispatch.
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
            No end receiver exchange address identified in current trace.
          </div>
        )}
      </div>

    </div>
  );
}
