import { describe, it, expect } from 'vitest';
import { evaluateAccuracy, formatAccuracyReport, LABELED_CASES } from './accuracy';

describe('labeled-set accuracy', () => {
  it('classifies every committed case correctly with honest coverage', () => {
    const report = evaluateAccuracy();
    // Printed on every run: this table IS the accuracy demonstration.
    console.log(`\n${formatAccuracyReport(report)}\n`);

    expect(LABELED_CASES.length).toBeGreaterThanOrEqual(10);
    expect(report.misses).toEqual([]);
    expect(report.accuracy).toBe(1);
    // Coverage floor: accuracy must not be bought by abstaining on everything.
    expect(report.coverage).toBeGreaterThanOrEqual(0.8);
  });
});
