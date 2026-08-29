import { describe, expect, it } from 'vitest';
import { resolveIntakeInspectionResume } from './intake-inspection-resume';

const inspections = [
  { id: 'historical', inspectionType: 'INTAKE', status: 'COMPLETED' },
  { id: 'current', inspectionType: 'INTAKE', status: 'COMPLETED' },
  { id: 'warranty', inspectionType: 'WARRANTY', status: 'DRAFT' },
] as const;

describe('intake inspection resume', () => {
  it('keeps the current completed intake inspection', () => {
    expect(
      resolveIntakeInspectionResume({
        currentInspectionId: 'current',
        inspections,
        requestedInspectionId: 'current',
      }),
    ).toEqual({ requestedInspectionWasIgnored: false, resumeId: 'current' });
  });

  it('allows any intake draft to resume', () => {
    expect(
      resolveIntakeInspectionResume({
        currentInspectionId: 'current',
        inspections: [...inspections, { id: 'draft', inspectionType: 'INTAKE', status: 'DRAFT' }],
        requestedInspectionId: 'draft',
      }),
    ).toEqual({ requestedInspectionWasIgnored: false, resumeId: 'draft' });
  });

  it('ignores a historical completed inspection and falls back to the current one', () => {
    expect(
      resolveIntakeInspectionResume({
        currentInspectionId: 'current',
        inspections,
        requestedInspectionId: 'historical',
      }),
    ).toEqual({ requestedInspectionWasIgnored: true, resumeId: 'current' });
  });

  it('does not resume a non-intake inspection from the intake workflow', () => {
    expect(
      resolveIntakeInspectionResume({
        currentInspectionId: 'warranty',
        inspections,
        requestedInspectionId: 'warranty',
      }),
    ).toEqual({ requestedInspectionWasIgnored: true, resumeId: undefined });
  });
});
