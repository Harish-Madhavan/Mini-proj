import React, { useState, useEffect } from 'react';
import {
  Search,
  Terminal,
  Zap,
  X
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { NAV_ITEMS } from '../constants/navigation';

export default function CommandPalette({ isOpen, onClose }) {
  const { scenarios, handleSelectCase, setActiveTab, handleSearch } = useCase();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const navigationItems = NAV_ITEMS.map((item, index) => ({
    label: `Go to ${item.label}`,
    path: item.id,
    icon: item.icon,
    category: 'Navigation',
    shortcut: String(index + 1),
  }));

  const caseItems = scenarios.map(c => ({
    label: `Open case: ${c.title}`,
    id: c.id,
    category: 'Cases',
    currency: c.currency,
    icon: Terminal
  }));

  const allItems = [
    ...navigationItems,
    ...caseItems
  ];

  const filteredItems = allItems.filter(item => 
    item.label.toLowerCase().includes(query.toLowerCase()) || 
    (item.category && item.category.toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleExecute = React.useCallback((item) => {
    if (item.path) {
      setActiveTab(item.path);
    } else if (item.id) {
      handleSelectCase(item.id);
    }
    onClose();
  }, [setActiveTab, handleSelectCase, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleExecute(filteredItems[selectedIndex]);
        } else if (query.trim()) {
          handleSearch(query.trim());
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, query, handleExecute, handleSearch, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 10002 }} role="presentation">
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{ 
          maxWidth: '540px', 
          width: '100%', 
          padding: '0', 
          overflow: 'hidden'
        }}
      >
        {/* Search Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', gap: '0.6rem', backgroundColor: '#121215' }}>
          <Search size={18} style={{ color: 'var(--primary)' }} />
          <input
            type="text"
            autoFocus
            placeholder="Type a command, or search a transaction/address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ 
              flex: 1, 
              background: 'none', 
              border: 'none', 
              outline: 'none', 
              color: '#fff', 
              fontSize: '0.95rem' 
            }}
          />
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', backgroundColor: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
            ESC to close
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}>
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: '340px', overflowY: 'auto', padding: '0.5rem' }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <p>No direct commands matching "{query}"</p>
              <button 
                onClick={() => { handleSearch(query); onClose(); }} 
                className="btn btn-primary" 
                style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}
              >
                <Zap size={13} /> Trace "{query.slice(0, 16)}..."
              </button>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={idx}
                  onClick={() => handleExecute(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(14, 165, 233, 0.3)' : '1px solid transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ 
                      padding: '0.35rem', 
                      borderRadius: '4px', 
                      backgroundColor: isSelected ? 'rgba(14, 165, 233, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? 'var(--primary)' : 'var(--text-secondary)'
                    }}>
                      <Icon size={15} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: isSelected ? '#fff' : 'var(--text-primary)' }}>
                        {item.label}
                      </span>
                      {item.category && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                          [{item.category}]
                        </span>
                      )}
                    </div>
                  </div>

                  {item.shortcut && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', backgroundColor: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                      Alt+{item.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(5, 8, 16, 0.8)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {filteredItems.length} result{filteredItems.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
