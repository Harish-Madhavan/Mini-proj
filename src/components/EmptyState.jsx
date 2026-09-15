import React from 'react';

/**
 * Shared empty-state block: centered muted icon + text. Keeps the five
 * "nothing here yet" panels consistent instead of hand-styling each one.
 */
export default function EmptyState({ icon, children }) {
  return (
    <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      {icon}
      <div>{children}</div>
    </div>
  );
}
