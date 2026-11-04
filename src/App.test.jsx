import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('application smoke test', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('hydrates case storage, renders the dashboard, and navigates to tracing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    window.history.replaceState({}, '', '/dashboard');

    render(<App />);

    expect(await screen.findByRole('form', { name: 'Blockchain trace search' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'AegisTrace' })).toBeTruthy();
    await waitFor(() => {
      expect(localStorage.getItem('aegistrace_case_state_recovery')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Go to Tracing' }));
    expect(await screen.findByRole('heading', { name: 'Fund flow' })).toBeTruthy();
  });
});
