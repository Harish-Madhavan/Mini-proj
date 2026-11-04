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

  it('opens the request-preparation worksheet without trusting a preset contact', async () => {
    vi.stubGlobal('indexedDB', undefined);
    window.history.replaceState({}, '', '/dashboard');

    render(<App />);
    expect(await screen.findByRole('form', { name: 'Blockchain trace search' })).toBeTruthy();

    fireEvent.click(screen.getByText('Tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Request prep' }));
    expect(await screen.findByRole('heading', { name: 'Request preparation worksheet' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Recipient email' }).value).toBe('');
    expect(screen.getByRole('button', { name: 'Email draft' }).disabled).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Request worksheet preview' }).value).toContain('NOT A SUBPOENA');
  });

  it('opens case comparison and timeline from primary navigation', async () => {
    vi.stubGlobal('indexedDB', undefined);
    window.history.replaceState({}, '', '/dashboard');

    render(<App />);
    expect(await screen.findByRole('form', { name: 'Blockchain trace search' })).toBeTruthy();

    fireEvent.click(screen.getByText('Tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Case comparison' }));
    expect(await screen.findByRole('heading', { name: 'Case comparison' })).toBeTruthy();
    expect(screen.getByRole('table').textContent).toContain('Tx reference coverage');

    fireEvent.click(screen.getByText('Tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Timeline' }));
    expect(await screen.findByRole('heading', { name: 'Investigation timeline' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Timeline case' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Search timeline events' })).toBeTruthy();
  });
});
