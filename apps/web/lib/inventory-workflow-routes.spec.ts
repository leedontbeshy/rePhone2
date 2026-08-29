import { describe, expect, it } from 'vitest';
import {
  intakeInspectionHref,
  intakeResumeHref,
  isVerifiedIntakeInspectionSource,
} from './inventory-workflow-routes';

describe('inventory workflow routes', () => {
  it('marks inspection links opened from intake', () => {
    expect(intakeInspectionHref('inspection/id')).toBe(
      '/backoffice/inventory/inspections/inspection%2Fid?source=intake',
    );
  });

  it('returns a completed inspection to its exact intake record', () => {
    expect(intakeResumeHref('unit id', 'inspection/id')).toBe(
      '/backoffice/inventory/intake?unitId=unit+id&inspectionId=inspection%2Fid',
    );
  });

  it('accepts the intake source only for an actual intake inspection', () => {
    expect(isVerifiedIntakeInspectionSource('intake', 'INTAKE')).toBe(true);
    expect(isVerifiedIntakeInspectionSource('intake', 'WARRANTY')).toBe(false);
    expect(isVerifiedIntakeInspectionSource(null, 'INTAKE')).toBe(false);
  });
});
