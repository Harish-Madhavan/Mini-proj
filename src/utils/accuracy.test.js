import { describe, it, expect } from 'vitest';
import { evaluateAccuracy, formatAccuracyReport, LABELED_CASES } from './accuracy';

describe('offline heuristic regression fixtures', () => {
  it('preserves expected fixture behavior without claiming empirical accuracy', () => {
    const report = evaluateAccuracy();
    // Fixture agreement is a regression check, not an independent benchmark.
    console.log(`\n${formatAccuracyReport(report)}\n`);

    expect(LABELED_CASES.length).toBeGreaterThanOrEqual(10);
    expect(report.misses).toEqual([]);
    expect(report.accuracy).toBe(1);
    // Coverage floor: accuracy must not be bought by abstaining on everything.
    expect(report.coverage).toBeGreaterThanOrEqual(0.75);
  });
});
