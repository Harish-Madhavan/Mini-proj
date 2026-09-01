import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }} role="alert" aria-live="assertive">
          <AlertTriangle size={36} style={{ color: '#ef4444' }} aria-hidden="true" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '480px' }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering this view.'}
          </p>
          <button onClick={this.handleReset} className="btn btn-primary" aria-label="Retry loading view">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
