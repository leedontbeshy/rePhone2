import { describe, expect, it } from 'vitest';
import type { InventoryInspectionDetail } from '@/lib/backoffice-inventory-api';
import {
  INSPECTION_CHECKS,
  INSPECTION_CHECK_GROUPS,
  inspectionCheckRequiresNote,
  inspectionDraftFrom,
  inspectionDraftProgress,
  validateInspectionDraft,
} from './inspection-editor-logic';

describe('FE-06 inspection editor logic', () => {
  it('defines exactly 18 unique checks grouped for scanning', () => {
    expect(INSPECTION_CHECK_GROUPS).toHaveLength(4);
    expect(INSPECTION_CHECKS).toHaveLength(18);
    expect(new Set(INSPECTION_CHECKS.map((check) => check.key)).size).toBe(18);
    expect(INSPECTION_CHECKS.map((check) => check.key)).toEqual([
      'DISPLAY',
      'TOUCHSCREEN',
      'FRONT_CAMERA',
      'REAR_CAMERA',
      'FACE_ID_TOUCH_ID',
      'SPEAKER',
      'MICROPHONE',
      'BUTTONS',
      'VIBRATION_HAPTICS',
      'WIFI',
      'BLUETOOTH',
      'CELLULAR',
      'CHARGING_PORT',
      'WIRELESS_CHARGING',
      'BATTERY_FUNCTION',
      'GPS_LOCATION',
      'SENSORS',
      'CONNECTORS_OTHER',
    ]);
  });

  it('hydrates stored checklist values into a complete local draft', () => {
    const draft = inspectionDraftFrom(
      inspection({
        checks: {
          schemaVersion: 1,
          items: { DISPLAY: { status: 'PASS', note: null } },
        },
      }),
    );

    expect(draft.checks.DISPLAY).toEqual({ status: 'PASS', note: '' });
    expect(draft.checks.TOUCHSCREEN).toEqual({ status: '', note: '' });
    expect(inspectionDraftProgress(draft)).toEqual({ completed: 1, total: 18 });
  });

  it('allows a partial valid draft but requires notes for non-pass results', () => {
    const draft = inspectionDraftFrom(inspection());
    const partial = {
      ...draft,
      checks: {
        ...draft.checks,
        DISPLAY: { status: 'PASS' as const, note: '' },
        TOUCHSCREEN: { status: 'DEGRADED' as const, note: '' },
      },
    };

    const invalid = validateInspectionDraft(partial, 'save');
    expect(invalid.errors['checks.TOUCHSCREEN.note']).toContain('ghi rõ');
    const valid = validateInspectionDraft(
      {
        ...partial,
        checks: {
          ...partial.checks,
          TOUCHSCREEN: { status: 'DEGRADED', note: 'Phản hồi chậm ở góc phải' },
        },
      },
      'save',
    );
    expect(valid.isValid).toBe(true);
    expect(valid.input.checks?.items.TOUCHSCREEN).toEqual({
      status: 'DEGRADED',
      note: 'Phản hồi chậm ở góc phải',
    });
  });

  it('requires all checks, battery, condition and known repair notes before completion', () => {
    const draft = inspectionDraftFrom(inspection());
    const validation = validateInspectionDraft(draft, 'complete');

    expect(validation.isValid).toBe(false);
    expect(validation.errors['checks.DISPLAY.status']).toBe('Hãy chọn kết quả.');
    expect(validation.errors['batteryHealthPercent']).toBe('Hãy nhập tình trạng pin.');
    expect(validation.errors['conditionGrade']).toBe('Hãy xếp loại ngoại hình.');

    const checks = Object.fromEntries(
      INSPECTION_CHECKS.map((check) => [check.key, { status: 'PASS' as const, note: '' }]),
    ) as typeof draft.checks;
    const complete = validateInspectionDraft(
      {
        ...draft,
        batteryHealthPercent: '91',
        checks,
        conditionGrade: 'A',
        repairHistoryStatus: 'KNOWN',
        repairNotes: 'Đã thay pin chính hãng',
      },
      'complete',
    );

    expect(complete.isValid).toBe(true);
    expect(Object.keys(complete.input.checks?.items ?? {})).toHaveLength(18);
    expect(complete.input).toMatchObject({
      batteryHealthPercent: 91,
      conditionGrade: 'A',
      repairHistoryStatus: 'KNOWN',
      repairNotes: 'Đã thay pin chính hãng',
    });
  });

  it('matches the backend note policy and validates numeric ranges', () => {
    expect(inspectionCheckRequiresNote('FAIL')).toBe(true);
    expect(inspectionCheckRequiresNote('NOT_TESTED')).toBe(true);
    expect(inspectionCheckRequiresNote('PASS')).toBe(false);
    expect(inspectionCheckRequiresNote('NOT_APPLICABLE')).toBe(false);

    const draft = inspectionDraftFrom(inspection());
    expect(
      validateInspectionDraft(
        { ...draft, batteryCycleCount: '-1', batteryHealthPercent: '101' },
        'save',
      ).errors,
    ).toMatchObject({
      batteryCycleCount: 'Chỉ nhập số nguyên không âm.',
      batteryHealthPercent: 'Giá trị phải từ 0 đến 100.',
    });
  });
});

function inspection(overrides: Partial<InventoryInspectionDetail> = {}): InventoryInspectionDetail {
  return {
    batteryCycleCount: null,
    batteryHealthPercent: null,
    batteryReplacementStatus: 'UNKNOWN',
    checks: null,
    checklist: null,
    conditionGrade: null,
    cosmeticNotes: null,
    createdAt: '2026-08-28T10:00:00.000Z',
    id: 'inspection-id',
    inspectedAt: null,
    inspectionType: 'INTAKE',
    inspector: null,
    inspectorId: 'employee-id',
    inventoryUnitId: 'unit-id',
    isCurrent: false,
    overallResult: 'INCOMPLETE',
    repairHistoryStatus: 'UNKNOWN',
    repairNotes: null,
    replacedParts: null,
    status: 'DRAFT',
    updatedAt: '2026-08-28T10:00:00.000Z',
    ...overrides,
  };
}
