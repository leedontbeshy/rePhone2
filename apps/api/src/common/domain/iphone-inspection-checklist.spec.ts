import { describe, expect, it } from 'vitest';
import {
  inspectionResult,
  IPHONE_CHECKLIST_V1,
  InspectionChecklistError,
  validateInspectionChecklist,
} from './iphone-inspection-checklist.js';

describe('iPhone inspection checklist', () => {
  it('accepts partial drafts and requires the exact 18 keys on complete', () => {
    expect(
      validateInspectionChecklist(
        { schemaVersion: 1, items: { DISPLAY: { status: 'PASS', note: null } } },
        false,
      ),
    ).toMatchObject({ schemaVersion: 1 });
    expect(() =>
      validateInspectionChecklist(
        { schemaVersion: 1, items: { DISPLAY: { status: 'PASS', note: null } } },
        true,
      ),
    ).toThrow(InspectionChecklistError);
  });

  it('computes PASSED, PARTIAL and FAILED and requires notes for non-pass states', () => {
    const passedItems = Object.fromEntries(
      IPHONE_CHECKLIST_V1.map(([key]) => [key, { status: 'PASS', note: null }]),
    );
    expect(
      inspectionResult(validateInspectionChecklist({ schemaVersion: 1, items: passedItems }, true)),
    ).toBe('PASSED');
    expect(
      inspectionResult(
        validateInspectionChecklist(
          {
            schemaVersion: 1,
            items: { ...passedItems, DISPLAY: { status: 'DEGRADED', note: 'Ám nhẹ' } },
          },
          true,
        ),
      ),
    ).toBe('PARTIAL');
    expect(
      inspectionResult(
        validateInspectionChecklist(
          {
            schemaVersion: 1,
            items: { ...passedItems, DISPLAY: { status: 'FAIL', note: 'Không hiển thị' } },
          },
          true,
        ),
      ),
    ).toBe('FAILED');
    expect(() =>
      validateInspectionChecklist(
        {
          schemaVersion: 1,
          items: { ...passedItems, DISPLAY: { status: 'FAIL', note: null } },
        },
        true,
      ),
    ).toThrow(InspectionChecklistError);
  });
});
