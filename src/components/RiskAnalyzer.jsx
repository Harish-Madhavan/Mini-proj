import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Sliders,
  Download
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

function InfoCard({ title, children }) {
  return (
    <div className="forensic-info-card">
      <div className="forensic-info-header">
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
    anomalyScore = 0,
    consolidationScore = 0,
    attributionScore = 0
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
- Consolidation sweep: ${consolidationScore > 0 ? `Detected (+${consolidationScore})` : 'None (0)'}
- Sanctioned/darknet attribution: ${attributionScore > 0 ? `Hit (+${attributionScore})` : 'None (0)'}

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
    },
    {
      label: "Sweep hub",
      display: consolidationScore > 0 ? `+${consolidationScore}%` : 'None',
      color: consolidationScore >= 15 ? '#ef4444' : consolidationScore > 0 ? '#f59e0b' : '#10b981',
      barPct: (consolidationScore / 15) * 100
    },
    {
      label: "Attribution",
      display: attributionScore > 0 ? `+${attributionScore}%` : 'Clean',
      color: attributionScore > 0 ? '#ef4444' : '#10b981',
      barPct: (attributionScore / 15) * 100
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '2rem' }}>
        
        {/* Risk Metrics Table */}
        <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <ShieldAlert size={15} style={{ color: 'var(--text-muted)' }} /> Risk analysis
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                Mixing, splits, destination, velocity, fee, sweep-hub, and attribution signals.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="btn-quiet"
                style={{ fontSize: '0.8rem' }}
              >
                <Sliders size={13} /> {showConfig ? "Hide Weights" : "Adjust Weights"}
              </button>
              <button
                onClick={handleExportDossier}
                className="btn-quiet"
                style={{ fontSize: '0.8rem' }}
                title="Download Formatted Risk Assessment Dossier"
              >
                <Download size={13} /> Dossier
              </button>
            </div>
          </div>

          {/* Weights Configuration Panel */}
          {showConfig && (
            <div className="config-slider-panel" style={{ paddingTop: '0.25rem', borderTop: '1px solid var(--border-soft)' }}>
              <WeightSlider label="Mixer weight" value={mixerWeight} min={10} max={50} onChange={setMixerWeight} />
              <WeightSlider label="Split weight" value={hopWeight} min={5} max={25} onChange={setHopWeight} />
              <WeightSlider label="Identity discount" value={kycDiscountWeight} min={5} max={30} onChange={setKycDiscountWeight} prefix="-" />
            </div>
          )}

          {/* Dimension breakdown (all forensic dimensions) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
            {dimensionMeters.map((m, idx) => (
              <Meter key={idx} {...m} />
            ))}
          </div>

          {/* Factor Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {riskFactors.map((rf, idx) => (
              <div key={idx} className="factor-row">
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>{rf.name}</span>
                    <span className="factor-category-tag">
                      {rf.category}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem' }}>{rf.description}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)'
                  }}>
                    {rf.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Gauge Panel */}
        <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <h4 style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>
            Risk score
          </h4>

          {/* Circular Risk Meter */}
          <div style={{ position: 'relative', width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="150" height="150" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border-color)" strokeWidth="6" />
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                fill="none" 
                stroke={calculatedRiskScore > 75 ? '#f87171' : calculatedRiskScore > 50 ? '#fbbf24' : '#34d399'} 
                strokeWidth="6"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 - (251.2 * calculatedRiskScore) / 100}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 0.6s ease-in-out' }}
              />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <span style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em', display: 'block' }}>{calculatedRiskScore}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/ 100</span>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {threatBadge.label}
            </span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.4rem', maxWidth: '260px' }}>
              {calculatedRiskScore >= 70
                ? "High risk — consider escalation."
                : calculatedRiskScore >= 35
                ? "Medium risk — monitoring suggested."
                : "Low risk — no mixing signatures."}
            </p>
          </div>
        </div>

      </div>

      {/* Obfuscation & Mixer Forensics Inspector */}
      {obfuscationDossier && (
        <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Obfuscation</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                Mixing, splits, bridges, structuring, and sweeps.
              </p>
            </div>

            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {obfuscationDossier.rating} · {obfuscationDossier.obfuscationScore}/100
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 2rem' }}>
            <InfoCard title="Splits">
              <InfoRow label="Status:">
                <strong>
                  {obfuscationDossier.peeling.isPeelingChain ? 'Split pattern' : 'Direct'}
                </strong>
              </InfoRow>
              <InfoRow label="Steps:"><span>{obfuscationDossier.peeling.hopCount}</span></InfoRow>
              <InfoRow label="Avg split:"><span>{obfuscationDossier.peeling.averagePeelEstimateBtc} BTC</span></InfoRow>
            </InfoCard>

            <InfoCard title="Mixing">
              <InfoRow label="Found:">
                <strong>
                  {obfuscationDossier.hasMixer ? `${obfuscationDossier.mixerCount}` : 'None'}
                </strong>
              </InfoRow>
              <InfoRow label="Outputs:"><span>{obfuscationDossier.hasMixer ? 'Equal-value pattern' : 'Varied'}</span></InfoRow>
            </InfoCard>

            <InfoCard title="Bridges & swaps">
              <InfoRow label="Found:">
                <strong>
                  {obfuscationDossier.crossChain?.detected
                    ? `${obfuscationDossier.crossChain.bridgeCount} hop(s)`
                    : obfuscationDossier.bridgeScan.detected ? `${obfuscationDossier.bridgeScan.count}` : 'None'}
                </strong>
              </InfoRow>
              {obfuscationDossier.crossChain?.hops?.length > 0 ? (
                obfuscationDossier.crossChain.hops.map((h, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    · {h.bridgeName} → {h.destinationChain} ({h.targetAsset})
                  </div>
                ))
              ) : (
                obfuscationDossier.bridgeScan.routersFound.map((r, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    · {r.routerName}
                  </div>
                ))
              )}
              {!obfuscationDossier.bridgeScan.detected && !obfuscationDossier.crossChain?.detected && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None found.</span>
              )}
            </InfoCard>

            <InfoCard title="Structuring">
              <InfoRow label="Found:">
                <strong>
                  {obfuscationDossier.structuring?.detected ? `${obfuscationDossier.structuring.maxBandSize} similar` : 'None'}
                </strong>
              </InfoRow>
              {obfuscationDossier.structuring?.detected ? (
                <>
                  <InfoRow label="Band:"><span>{obfuscationDossier.structuring.sources[0]?.bands[0]?.valueBtc} BTC × {obfuscationDossier.structuring.sources[0]?.bands[0]?.count}</span></InfoRow>
                  <InfoRow label="Confidence:"><span style={{ fontWeight: 600 }}>{obfuscationDossier.structuring.confidence}%</span></InfoRow>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No batch payments.</span>
              )}
            </InfoCard>

            <InfoCard title="Sweep">
              <InfoRow label="Found:">
                <strong>
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
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No gathering.</span>
              )}
            </InfoCard>
          </div>

          {/* Forensic Recommendations */}
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '0.85rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Recommendations
            </span>
            <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
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
