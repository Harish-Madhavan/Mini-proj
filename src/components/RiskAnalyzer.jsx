import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  Sliders,
  Download,
  Shuffle,
  Layers,
  GitMerge,
  Split,
  Zap
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { calculateForensicRiskScore } from '../utils/riskScoring';
import { downloadText } from '../utils/download';
import { generateObfuscationDossier } from '../utils/obfuscationForensics';

const URGENCY_LABELS = {
  CRITICAL_ACTION_REQUIRED: 'act now',
  MONITORING_RECOMMENDED: 'watch',
  INFORMATIONAL: 'for reference',
  ROUTINE: 'routine',
};

function Meter({ label, display, color, barPct }) {
  const safePct = Math.max(0, Math.min(100, Number.isFinite(barPct) ? barPct : 0));
  return (
    <div className="meter-card">
      <div className="meter-header">
        <span className="meter-label">{label}</span>
        <strong className="meter-value" style={{ color }}>{display}</strong>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${safePct}%`, backgroundColor: color }}></div>
      </div>
    </div>
  );
}

function WeightSlider({ label, value, min, max, onChange, prefix = '' }) {
  return (
    <div className="config-slider-group">
      <div className="config-slider-label">
        <span>{label}</span>
        <strong>{prefix}{value}%</strong>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function InfoCard({ icon, color, title, children }) {
  return (
    <div className="forensic-info-card">
      <div className="forensic-info-header" style={{ color }}>
        {icon}
        <span>{title}</span>
      </div>
      <div className="forensic-info-body">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="forensic-info-row">
      <span className="forensic-info-row-label">{label}</span>
      {children}
    </div>
  );
}

export default function RiskAnalyzer() {
  const { activeCase } = useCase();
  const { showToast } = useToast();

  const [mixerWeight, setMixerWeight] = useState(35);
  const [hopWeight, setHopWeight] = useState(12);
  const [kycDiscountWeight, setKycDiscountWeight] = useState(15);
  const [showConfig, setShowConfig] = useState(false);

  const obfuscationDossier = useMemo(() => {
    return activeCase ? generateObfuscationDossier(activeCase) : null;
  }, [activeCase]);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  const assessment = calculateForensicRiskScore(activeCase, {
    mixerWeight,
    hopWeight,
    kycDiscountWeight
  });

  const {
    riskScore: calculatedRiskScore,
    isHistoricalEra,
    isKycVerified,
    threatBadge,
    dimensions,
    threatSignatures: riskFactors,
    statutoryAction
  } = assessment;

  const {
    obfuscationScore,
    layeringScore,
    destinationScore,
    velocityScore,
    anomalyScore = 0
  } = dimensions;

  const handleExportDossier = () => {
    const reportText = `BLOCKCHAIN FORENSIC RISK DOSSIER
======================================================
Case Reference: ${activeCase.id.toUpperCase()} - ${activeCase.title}
Date of Evaluation: ${new Date().toISOString()}
Currency: ${activeCase.currency}
Wallets checked: ${activeCase.nodes.length}

RISK SCORE: ${calculatedRiskScore} / 100 [${threatBadge.label}]
------------------------------------------------------
BREAKDOWN:
- Mixing: ${obfuscationScore}%
- Splits: ${layeringScore}%
- Destination identity: ${isKycVerified ? 'Verified' : isHistoricalEra ? 'Early transfer' : 'Unknown'} (${destinationScore}%)
- Velocity: ${velocityScore}%
- Protocol anomaly (RBF/fee): ${anomalyScore > 0 ? `Detected (+${anomalyScore})` : 'None (0)'}

STRUCTURING / SWEEP SIGNALS:
- Structuring: ${obfuscationDossier?.structuring?.detected ? `DETECTED (${obfuscationDossier.structuring.maxBandSize} similar payments, confidence ${obfuscationDossier.structuring.confidence}%)` : 'not detected'}
- Consolidation sweep: ${obfuscationDossier?.sweeps?.detected ? `DETECTED (${obfuscationDossier.sweeps.sweeps[0]?.inputCount} inputs to ${obfuscationDossier.sweeps.sweeps[0]?.consolidatedBtc} BTC, ${obfuscationDossier.sweeps.sweeps[0]?.cashoutUrgency})` : 'not detected'}
- Cross-chain hops: ${obfuscationDossier?.crossChain?.detected ? `DETECTED (${obfuscationDossier.crossChain.bridgeCount} hop(s) exiting into ${obfuscationDossier.crossChain.targetChains.join(', ')})` : 'not detected'}

SIGNALS:
${riskFactors.map(rf => `[${rf.status.toUpperCase()}] ${rf.name} (${rf.score})\n  Category: ${rf.category}\n  Details: ${rf.description}`).join('\n\n')}

NEXT STEPS (${URGENCY_LABELS[statutoryAction.urgency] || 'routine'}):
${statutoryAction.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}
======================================================
Generated by AegisTrace`;

    downloadText(reportText, `NCB-Risk-Dossier-${activeCase.id.toUpperCase()}.txt`);
    showToast("Risk report downloaded.", "success");
  };

  const dimensionMeters = [
    {
      label: "Mixer risk",
      display: `${obfuscationScore}%`,
      color: obfuscationScore > 25 ? '#ef4444' : obfuscationScore > 0 ? '#f59e0b' : '#10b981',
      barPct: mixerWeight > 0 ? (obfuscationScore / mixerWeight) * 100 : 0
    },
    {
      label: "Splits",
      display: `${layeringScore}%`,
      color: layeringScore > 20 ? '#ef4444' : layeringScore > 10 ? '#f59e0b' : '#10b981',
      barPct: (layeringScore / 40) * 100
    },
    {
      label: "Destination",
      display: isKycVerified ? 'Verified' : isHistoricalEra ? 'Early transfer' : 'Unknown',
      color: isKycVerified ? '#10b981' : isHistoricalEra ? '#38bdf8' : '#ef4444',
      barPct: (destinationScore / 18) * 100
    },
    {
      label: "Velocity",
      display: `${velocityScore}%`,
      color: velocityScore > 3 ? '#ef4444' : velocityScore > 0 ? '#f59e0b' : '#10b981',
      barPct: (velocityScore / 6) * 100
    },
    {
      label: "Protocol / RBF",
      display: anomalyScore > 0 ? `+${anomalyScore}%` : 'Clean',
      color: anomalyScore > 0 ? '#f59e0b' : '#10b981',
      barPct: (anomalyScore / 6) * 100
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
        
        {/* Risk Metrics Table */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert style={{ color: 'var(--risk-high)' }} /> Risk analysis
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Scores the graph on mixing, splits, destination, velocity, and fee signals.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className={`btn ${showConfig ? 'btn-primary' : 'btn-outline'}`}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              >
                <Sliders size={13} /> {showConfig ? "Hide Weights" : "Adjust Weights"}
              </button>
              <button
                onClick={handleExportDossier}
                className="btn"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                title="Download Formatted Risk Assessment Dossier"
              >
                <Download size={13} /> Dossier
              </button>
            </div>
          </div>

          {/* Weights Configuration Panel */}
          {showConfig && (
            <div className="config-slider-panel">
              <WeightSlider label="Mixer weight" value={mixerWeight} min={10} max={50} onChange={setMixerWeight} />
              <WeightSlider label="Split weight" value={hopWeight} min={5} max={25} onChange={setHopWeight} />
              <WeightSlider label="Identity discount" value={kycDiscountWeight} min={5} max={30} onChange={setKycDiscountWeight} prefix="-" />
            </div>
          )}

          {/* Dimension breakdown (all 5 forensic dimensions) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
            {dimensionMeters.map((m, idx) => (
              <Meter key={idx} {...m} />
            ))}
          </div>

          {/* Factor Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {riskFactors.map((rf, idx) => (
              <div key={idx} className="factor-row">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {rf.status === 'detected' ? (
                      <AlertTriangle size={15} style={{ color: 'var(--risk-high)' }} />
                    ) : (
                      <CheckCircle size={15} style={{ color: 'var(--risk-low)' }} />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{rf.name}</span>
                    <span className="factor-category-tag">
                      {rf.category}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{rf.description}</p>
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
            Risk score
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
                style={{ transition: 'stroke-dashoffset 0.6s ease-in-out' }}
              />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <span style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', display: 'block' }}>{calculatedRiskScore}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>out of 100</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <span style={{ 
              fontSize: '0.8rem', 
              fontWeight: 600, 
              padding: '0.25rem 0.6rem', 
              borderRadius: '4px',
              backgroundColor: threatBadge.bg,
              color: threatBadge.color,
              textTransform: 'uppercase'
            }}>
              {threatBadge.label}
            </span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem', maxWidth: '280px' }}>
              {calculatedRiskScore >= 70
                ? "High risk. Consider escalation."
                : calculatedRiskScore >= 35
                ? "Medium risk. Monitoring suggested."
                : "Low risk. No mixing signatures."}
            </p>
          </div>
        </div>

      </div>

      {/* Obfuscation & Mixer Forensics Inspector */}
      {obfuscationDossier && (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shuffle style={{ color: '#a855f7' }} size={22} />
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Obfuscation</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Mixing, peeling, bridges, structuring, and sweeps in this case.
                </p>
              </div>
            </div>

            <span style={{ 
              fontSize: '0.75rem', 
              fontWeight: 700, 
              padding: '0.25rem 0.65rem', 
              borderRadius: '4px',
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: obfuscationDossier.badgeColor,
              border: `1px solid ${obfuscationDossier.badgeColor}`
            }}>
              {obfuscationDossier.rating} ({obfuscationDossier.obfuscationScore}/100)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <InfoCard icon={<Layers size={16} />} color="#38bdf8" title="Splits">
              <InfoRow label="Status:">
                <strong style={{ color: obfuscationDossier.peeling.isPeelingChain ? '#f59e0b' : '#10b981' }}>
                  {obfuscationDossier.peeling.isPeelingChain ? 'Split pattern found' : 'Direct'}
                </strong>
              </InfoRow>
              <InfoRow label="Steps:"><span>{obfuscationDossier.peeling.hopCount}</span></InfoRow>
              <InfoRow label="Avg split:"><span>{obfuscationDossier.peeling.averagePeelEstimateBtc} BTC / step</span></InfoRow>
              <InfoRow label="Pattern:"><span style={{ fontWeight: 600 }}>{obfuscationDossier.peeling.layeringMaturity}</span></InfoRow>
            </InfoCard>

            <InfoCard icon={<Shuffle size={16} />} color="#a855f7" title="Mixing">
              <InfoRow label="Found:">
                <strong style={{ color: obfuscationDossier.hasMixer ? '#ef4444' : '#10b981' }}>
                  {obfuscationDossier.hasMixer ? `${obfuscationDossier.mixerCount} found` : 'None'}
                </strong>
              </InfoRow>
              <InfoRow label="Equal outputs:"><span>{obfuscationDossier.hasMixer ? 'Mixer pattern' : 'Varied amounts'}</span></InfoRow>
              <InfoRow label="Matching outputs:"><span>{obfuscationDossier.hasMixer ? '5 or more' : 'Just 1'}</span></InfoRow>
            </InfoCard>

            <InfoCard icon={<GitMerge size={16} />} color="#10b981" title="Bridges & swaps">
              <InfoRow label="Found:">
                <strong style={{ color: (obfuscationDossier.crossChain?.detected || obfuscationDossier.bridgeScan.detected) ? '#ef4444' : '#10b981' }}>
                  {obfuscationDossier.crossChain?.detected 
                    ? `${obfuscationDossier.crossChain.bridgeCount} cross-chain hop(s)`
                    : obfuscationDossier.bridgeScan.detected ? `${obfuscationDossier.bridgeScan.count} found` : 'None'}
                </strong>
              </InfoRow>
              {obfuscationDossier.crossChain?.hops?.length > 0 ? (
                obfuscationDossier.crossChain.hops.map((h, i) => (
                  <div key={i} style={{ fontSize: '0.725rem', color: '#fca5a5', marginTop: '0.2rem' }}>
                    • {h.bridgeName} → <strong style={{ color: '#38bdf8' }}>{h.destinationChain} ({h.targetAsset})</strong>
                    {h.destinationAddress && h.destinationAddress !== 'N/A' && (
                      <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: '0.6rem' }}>
                        Dest: {h.destinationAddress.length > 20 ? `${h.destinationAddress.slice(0, 10)}...${h.destinationAddress.slice(-6)}` : h.destinationAddress}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                obfuscationDossier.bridgeScan.routersFound.map((r, i) => (
                  <div key={i} style={{ fontSize: '0.725rem', color: '#fca5a5' }}>
                    • {r.routerName} ({r.category.replace(/-/g, ' ')})
                  </div>
                ))
              )}
              {!obfuscationDossier.bridgeScan.detected && !obfuscationDossier.crossChain?.detected && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No instant swap services found in this trail.</span>
              )}
            </InfoCard>

            <InfoCard icon={<Split size={16} />} color="#f59e0b" title="Structuring">
              <InfoRow label="Found:">
                <strong style={{ color: obfuscationDossier.structuring?.detected ? '#f59e0b' : '#10b981' }}>
                  {obfuscationDossier.structuring?.detected ? `${obfuscationDossier.structuring.maxBandSize} similar payments` : 'None'}
                </strong>
              </InfoRow>
              {obfuscationDossier.structuring?.detected ? (
                <>
                  <InfoRow label="Band:"><span>{obfuscationDossier.structuring.sources[0]?.bands[0]?.valueBtc} BTC × {obfuscationDossier.structuring.sources[0]?.bands[0]?.count}</span></InfoRow>
                  <InfoRow label="Confidence:"><span style={{ fontWeight: 600 }}>{obfuscationDossier.structuring.confidence}%</span></InfoRow>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No batch payments from a single source.</span>
              )}
            </InfoCard>

            <InfoCard icon={<Zap size={16} />} color="#ef4444" title="Sweep">
              <InfoRow label="Found:">
                <strong style={{ color: obfuscationDossier.sweeps?.detected ? '#ef4444' : '#10b981' }}>
                  {obfuscationDossier.sweeps?.detected
                    ? (obfuscationDossier.sweeps.sweeps.some(s => s.cashoutUrgency === 'IMMINENT') ? 'Likely cash-out' : 'Aggregation')
                    : 'None'}
                </strong>
              </InfoRow>
              {obfuscationDossier.sweeps?.detected ? (
                <>
                  <InfoRow label="Inputs:"><span>{obfuscationDossier.sweeps.sweeps[0]?.inputCount} → {obfuscationDossier.sweeps.sweeps[0]?.consolidatedBtc} BTC</span></InfoRow>
                  <InfoRow label="Confidence:"><span style={{ fontWeight: 600 }}>{obfuscationDossier.sweeps.confidence}%</span></InfoRow>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No fund gathering in this trail.</span>
              )}
            </InfoCard>
          </div>

          {/* Forensic Recommendations */}
          <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.8)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.8rem 1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Recommendations:
            </span>
            <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {obfuscationDossier.recommendations.map((rec, i) => (
                <li key={i} style={{ marginBottom: '0.2rem' }}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

    </div>
  );
}
