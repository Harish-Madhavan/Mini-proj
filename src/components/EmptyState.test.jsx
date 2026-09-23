import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState Component', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders children and icon properly', () => {
    render(
      <EmptyState icon={<span data-testid="test-icon">🔍</span>}>
        No suspect transactions detected.
      </EmptyState>
    );

    expect(screen.getByTestId('test-icon')).toBeDefined();
    expect(screen.getByText('No suspect transactions detected.')).toBeDefined();
  });
});
