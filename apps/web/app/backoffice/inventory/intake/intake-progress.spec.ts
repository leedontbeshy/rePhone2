import { describe, expect, it } from 'vitest';
import { resolveIntakeStep } from './intake-progress';

describe('inventory intake progress', () => {
  it.each([
    [{ hasUnit: false, hasMedia: false, inspectionPassed: false, isAvailable: false }, 1],
    [{ hasUnit: true, hasMedia: false, inspectionPassed: false, isAvailable: false }, 2],
    [{ hasUnit: true, hasMedia: true, inspectionPassed: false, isAvailable: false }, 3],
    [{ hasUnit: true, hasMedia: true, inspectionPassed: true, isAvailable: false }, 4],
    [{ hasUnit: true, hasMedia: true, inspectionPassed: true, isAvailable: true }, 5],
  ] as const)('resolves state %o to step %s', (state, expectedStep) => {
    expect(resolveIntakeStep(state)).toBe(expectedStep);
  });

  it('keeps a completed but failed inspection at the inspection step', () => {
    expect(
      resolveIntakeStep({
        hasUnit: true,
        hasMedia: true,
        inspectionPassed: false,
        isAvailable: false,
      }),
    ).toBe(3);
  });
});
