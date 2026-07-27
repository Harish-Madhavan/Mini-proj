import React from 'react';
import { 
  ShieldAlert, 
  Activity, 
  CheckCircle,
  AlertTriangle,
  FileCheck2
} from 'lucide-react';

export default function RiskAnalyzer({ activeCase }) {
  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  const hasMixer = activeCase.nodes.some(n => n.type === 'mixer');
  const hopCount = activeCase.nodes.filter(n => n.type === 'hop').length;
  const receiverNode = activeCase.nodes.find(n => n.type === 'receiver');
  const isKycVerified = receiverNode?.details?.kycStatus?.includes('KYC') || receiverNode?.details?.kycStatus?.includes('VERIFIED');

  // Compute dynamic risk factors based on graph analysis
  const riskFactors = [
    { 
      name: hasMixer ? "Privacy Mixer Interaction (Wasabi / Tornado)" : "Structured Outspend Routing", 
      score: hasMixer ? "+40%" : "+25%", 
      category: "Obfuscation Analysis", 
      description: hasMixer ? "Direct transaction linkage with a known decentralized coinjoin or mixer." : "Sequential multi-hop routing detected between wallet hubs.", 
      status: "detected" 
    },
    { 
      name: "Peeling Chain Pattern", 
      score: `+${Math.min(35, hopCount * 15)}%`, 
      category: "Layering Hop Analysis", 
      description: `Detected ${hopCount} intermediate transit hops splitting value across structured change addresses.`, 
      status: hopCount > 0 ? "detected" : "mitigated" 
    },
    { 
      name: "End Receiver Settlement Attribution", 
      score: isKycVerified ? "-15%" : "+20%", 
      category: "Destination Attribution", 
      description: isKycVerified ? "Terminal destination resolves to a KYC-registered exchange deposit point." : "Terminal destination remains unspent or non-KYC unspent UTXO.", 
      status: isKycVerified ? "mitigated" : "detected" 
    }
  ];

  // Dynamic audit score calculation
  const baseScore = 50;
  const mixerBonus = hasMixer ? 35 : 15;
  const hopBonus = Math.min(30, hopCount * 10);
  const kycDiscount = isKycVerified ? -15 : 10;
  const calculatedRiskScore = Math.min(99, Math.max(20, baseScore + mixerBonus + hopBonus + kycDiscount));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
      
      {/* Risk Metrics Table */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert style={{ color: 'var(--risk-high)' }} /> Dynamic Graph Risk Analysis
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Evaluates graph pathing, peeling chain hop depth, mixer interactions, and end receiver settlement properties.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
          {riskFactors.map((rf, i) => (
            <div 
              key={i} 
              style={{ 
                padding: '1rem', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {rf.status === 'detected' ? (
                    <AlertTriangle size={16} style={{ color: 'var(--risk-medium)' }} />
                  ) : (
                    <CheckCircle size={16} style={{ color: 'var(--risk-low)' }} />
                  )}
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{rf.name}</h4>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    {rf.category}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{rf.description}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ 
                  fontSize: '0.9rem', 
                  fontWeight: 700, 
                  color: rf.status === 'detected' ? 'var(--risk-high)' : 'var(--risk-low)' 
                }}>
                  {rf.score}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Explainability panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity style={{ color: 'var(--primary)' }} /> Calculated Risk Score
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem 0', position: 'relative' }}>
          <svg width="150" height="150" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" />
            <circle 
              cx="50" 
              cy="50" 
              r="40" 
              stroke={calculatedRiskScore > 85 ? 'var(--risk-high)' : calculatedRiskScore > 60 ? 'var(--risk-medium)' : 'var(--risk-low)'} 
              strokeWidth="8" 
              fill="none" 
              strokeDasharray="251"
              strokeDashoffset={251 - (251 * calculatedRiskScore) / 100}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
            <text x="50" y="55" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="bold">
              {calculatedRiskScore}%
            </text>
          </svg>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontWeight: 600 }}>
            Automated Forensic Danger Index
          </span>
        </div>

        {/* Explainability Breakdown Card */}
        <div className="glass-panel" style={{ padding: '1rem', borderLeft: '3px solid var(--primary)', backgroundColor: 'rgba(0, 240, 255, 0.02)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <FileCheck2 size={14} /> Risk Scoring Breakdown
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Base Threat Factor:</span>
              <strong style={{ color: '#fff' }}>+{baseScore}%</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Obfuscation & Mixer Penalty:</span>
              <strong style={{ color: 'var(--risk-high)' }}>+{mixerBonus + hopBonus}%</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>End Receiver Mitigation:</span>
              <strong style={{ color: isKycVerified ? 'var(--risk-low)' : 'var(--risk-high)' }}>{kycDiscount}%</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Final Risk Grade:</span>
              <strong style={{ color: 'var(--primary)' }}>{calculatedRiskScore}% Score</strong>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
