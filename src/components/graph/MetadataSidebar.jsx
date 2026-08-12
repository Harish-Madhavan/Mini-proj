import React from 'react';
import { 
  ShieldAlert, 
  User, 
  HelpCircle, 
  MapPin, 
  Layers, 
  Cpu, 
  Copy,
  Search,
  FileCode,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';

export default function MetadataSidebar({ selectedNode, onSelectTab, onExpandAddress }) {
  const { showToast } = useToast();

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!", "success");
  };

  const details = selectedNode?.details || {};

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderLeft: '3px solid var(--primary-glow)' }}>
      {selectedNode ? (
        <>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                textTransform: 'uppercase', 
                padding: '0.2rem 0.5rem', 
                borderRadius: '4px',
                backgroundColor: 
                  selectedNode.risk === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 
                  selectedNode.risk === 'high' ? 'rgba(239, 68, 68, 0.1)' : 
                  selectedNode.risk === 'medium' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                color: 
                  selectedNode.risk === 'critical' ? '#ef4444' : 
                  selectedNode.risk === 'high' ? '#f87171' : 
                  selectedNode.risk === 'medium' ? '#fbbf24' : '#34d399'
              }}>
                {selectedNode.risk} risk
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>{selectedNode.balance}</span>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {selectedNode.type === 'suspect' ? <ShieldAlert style={{ color: '#ef4444' }} /> : selectedNode.type === 'receiver' ? <Layers style={{ color: '#10b981' }} /> : <Cpu />}
              {selectedNode.entityName}
            </h3>
          </div>

          {/* Address / Tx Reference Bar */}
          <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.9)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Reference Hash / Address</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
              <span className="mono-addr" style={{ fontSize: '0.8rem', wordBreak: 'break-all', marginRight: '0.5rem' }}>{details.address}</span>
              <button 
                onClick={() => handleCopy(details.address)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                title="Copy Reference"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          {/* Forensic Metadata & Technical Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.825rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Type/Role:</span>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{selectedNode.type}</span>
            </div>

            {details.scriptStandard && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FileCode size={13} style={{ color: 'var(--primary)' }} /> Script Standard:
                </span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{details.scriptStandard}</span>
              </div>
            )}

            {details.feeRateSatVb && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={13} style={{ color: '#f59e0b' }} /> Fee Rate:
                </span>
                <span style={{ fontWeight: 600 }}>{details.feeRateSatVb} ({details.vsize})</span>
              </div>
            )}

            {details.rbfStatus && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>RBF Protocol:</span>
                <span style={{ fontWeight: 600, color: details.rbfStatus.includes('Enabled') ? '#f59e0b' : 'var(--text-secondary)' }}>
                  {details.rbfStatus}
                </span>
              </div>
            )}

            {details.confirmations && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle2 size={13} style={{ color: '#10b981' }} /> Confirmation:
                </span>
                <span style={{ fontWeight: 600 }}>{details.confirmations}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Last Activity:</span>
              <span style={{ fontWeight: 600 }}>{details.lastActive}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>IP Logs (OSINT):</span>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={12} style={{ color: '#ef4444' }} /> {details.ipLog}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>KYC Status:</span>
              <span style={{ fontWeight: 600, color: selectedNode.type === 'receiver' ? '#10b981' : 'var(--text-muted)' }}>
                {details.kycStatus}
              </span>
            </div>

            {/* OP_RETURN Decoded Payload Banner */}
            {details.opReturnHex && (
              <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(168, 85, 247, 0.08)', border: '1px solid #a855f7', borderRadius: '6px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                  Decoded OP_RETURN Data
                </span>
                {details.opReturnDecoded && (
                  <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600, marginBottom: '0.3rem' }}>
                    "{details.opReturnDecoded}"
                  </div>
                )}
                <div className="mono-addr" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  Raw Hex: {details.opReturnHex}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ShieldAlert size={12} /> Risk Rationale:</span>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: '1.4' }}>{details.riskReason}</p>
            </div>
          </div>

          {/* Expand hop and KYC options */}
          {selectedNode.type === 'receiver' ? (
            <div className="pulse-glow-border" style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.05)', 
              border: '1px solid #10b981', 
              borderRadius: '8px', 
              padding: '0.75rem' 
            }}>
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <User size={12} /> KYC Profile Available
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.25rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                <div>Name: <strong style={{ color: '#fff' }}>{details.ownerName || 'Identified Gateway'}</strong></div>
                <div>ID Document: <strong style={{ color: '#fff' }}>{details.kycDocumentId || 'SUBPOENA READY'}</strong></div>
              </div>
              <button
                onClick={() => onSelectTab('osint')}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '0.75rem',
                  padding: '0.4rem',
                  justifyContent: 'center',
                  fontSize: '0.8rem'
                }}
              >
                Request Formal Notice
              </button>
            </div>
          ) : !selectedNode.id.startsWith('tx_') && onExpandAddress ? (
            <button
              onClick={() => onExpandAddress(details.address)}
              className="btn btn-outline"
              style={{
                width: '100%',
                marginTop: 'auto',
                padding: '0.6rem',
                justifyContent: 'center',
                fontSize: '0.85rem'
              }}
            >
              <Search size={14} /> Trace Forward (Query Address Hops)
            </button>
          ) : null}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          <HelpCircle size={40} />
          <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>Select a node in the graph explorer to inspect its cryptocurrency parameters.</p>
        </div>
      )}
    </div>
  );
}
