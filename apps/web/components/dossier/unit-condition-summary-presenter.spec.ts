import { describe, expect, it } from 'vitest';
import {
  buildUnitConditionSummary,
  type UnitConditionSource,
} from './unit-condition-summary-presenter';

describe('unit condition summary presenter', () => {
  it('builds customer-readable appearance, battery and repair-history rows', () => {
    expect(buildUnitConditionSummary(completeUnit)).toEqual({
      rows: [
        {
          detail: 'Có dấu sử dụng rõ trên khung và mặt lưng.',
          key: 'appearance',
          label: 'Ngoại hình',
          value: 'Grade C',
        },
        {
          detail: 'Pin nguyên bản',
          key: 'battery',
          label: 'Pin',
          value: '75% · 428 chu kỳ',
        },
        {
          key: 'repair-history',
          label: 'Lịch sử sửa chữa',
          value: 'Chưa ghi nhận sửa chữa',
        },
      ],
    });
  });

  it('omits blank optional text and keeps a useful battery row without metrics', () => {
    const summary = buildUnitConditionSummary({
      ...completeUnit,
      batteryCycleCount: null,
      batteryHealthPercent: null,
      batteryReplacementStatus: 'REPLACED',
      cosmeticNotes: '   ',
    });

    expect(summary.rows[0]).toEqual({
      key: 'appearance',
      label: 'Ngoại hình',
      value: 'Grade C',
    });
    expect(summary.rows[1]).toEqual({
      key: 'battery',
      label: 'Pin',
      value: 'Pin đã thay',
    });
  });

  it('does not overstate an unknown repair history or battery replacement status', () => {
    const summary = buildUnitConditionSummary({
      ...completeUnit,
      batteryCycleCount: null,
      batteryReplacementStatus: 'UNKNOWN',
      repairHistoryStatus: 'UNKNOWN',
    });

    expect(summary.rows[1]).toMatchObject({
      detail: 'Chưa xác định tình trạng linh kiện pin',
      value: '75%',
    });
    expect(summary.rows[2]?.value).toBe('Chưa đủ thông tin');
  });

  it('uses a general customer-facing label when repairs are recorded', () => {
    const summary = buildUnitConditionSummary({
      ...completeUnit,
      repairHistoryStatus: 'KNOWN',
    });

    expect(summary.rows[2]?.value).toBe('Có ghi nhận sửa chữa');
  });
});

const completeUnit = {
  batteryCycleCount: 428,
  batteryHealthPercent: 75,
  batteryReplacementStatus: 'ORIGINAL',
  conditionGrade: 'C',
  cosmeticNotes: 'Có dấu sử dụng rõ trên khung và mặt lưng.',
  repairHistoryStatus: 'NONE_KNOWN',
} satisfies UnitConditionSource;
