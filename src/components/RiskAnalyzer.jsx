import React from 'react';
import { 
  ShieldAlert, 
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { useCase } from '../hooks/useCase';

export default function RiskAnalyzer() {
  const { activeCase } = useCase();

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

      {/* Dynamic Gauge Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Aggregate Risk Index
        </h4>

        {/* Circular Risk Meter */}
        <div style={{ position: 'relative', width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="180" height="180" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="8" />
            <circle 
              cx="50" 
              cy="50" 
              r="40" 
              fill="none" 
              stroke={calculatedRiskScore > 75 ? '#ef4444' : calculatedRiskScore > 50 ? '#f59e0b' : '#10b981'} 
              strokeWidth="8"
              strokeDasharray="251.2"
              strokeDashoffset={251.2 - (251.2 * calculatedRiskScore) / 100}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
            />
          </svg>
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <span style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', display: 'block' }}>{calculatedRiskScore}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>out of 100</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <span style={{ 
            fontSize: '0.85rem', 
            fontWeight: 700, 
            padding: '0.3rem 0.8rem', 
            borderRadius: '20px',
            backgroundColor: calculatedRiskScore > 75 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            color: calculatedRiskScore > 75 ? '#ef4444' : '#f59e0b',
            textTransform: 'uppercase'
          }}>
            {calculatedRiskScore > 75 ? "CRITICAL RISK LEVEL" : "HIGH RISK LEVEL"}
          </span>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
            Automatic escalation triggered for NCB Section 67 subpoena issuance.
          </p>
        </div>
      </div>

    </div>
  );
}
