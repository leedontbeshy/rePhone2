import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { UnitConditionSource } from './unit-condition-summary-presenter';
import { UnitConditionSummary } from './unit-condition-summary';

describe('unit condition summary', () => {
  it('renders only the narrow public condition projection', () => {
    const unitWithUnrelatedFields = {
      batteryCycleCount: 428,
      batteryHealthPercent: 75,
      batteryReplacementStatus: 'ORIGINAL',
      conditionGrade: 'C',
      cosmeticNotes: 'Có dấu sử dụng rõ trên khung và mặt lưng.',
      functionalChecks: [{ label: 'Face ID', status: 'PASS' }],
      inventoryCode: 'PRIVATE-INVENTORY-CODE',
      repairHistoryStatus: 'KNOWN',
      repairNotes: 'Ghi chú sửa chữa không dành cho panel.',
      replacedParts: ['DISPLAY'],
    } as UnitConditionSource & Record<string, unknown>;

    const markup = renderToStaticMarkup(<UnitConditionSummary unit={unitWithUnrelatedFields} />);

    expect(markup).toContain('Tình trạng của máy');
    expect(markup).toContain('Loại C');
    expect(markup).toContain('75% · 428 chu kỳ');
    expect(markup).toContain('Pin nguyên bản');
    expect(markup).toContain('Có ghi nhận sửa chữa');
    expect(markup).not.toContain('Face ID');
    expect(markup).not.toContain('PRIVATE-INVENTORY-CODE');
    expect(markup).not.toContain('Ghi chú sửa chữa không dành cho panel.');
    expect(markup).not.toContain('DISPLAY');
  });

  it('keeps all three condition rows when optional supporting details are absent', () => {
    const unit = {
      batteryCycleCount: null,
      batteryHealthPercent: null,
      batteryReplacementStatus: 'UNKNOWN',
      conditionGrade: 'B',
      cosmeticNotes: null,
      repairHistoryStatus: 'UNKNOWN',
    } satisfies UnitConditionSource;

    const markup = renderToStaticMarkup(<UnitConditionSummary unit={unit} />);

    expect(markup.match(/data-condition-key=/g)).toHaveLength(3);
    expect(markup).toContain('Chưa xác định tình trạng linh kiện pin');
    expect(markup).toContain('Chưa đủ thông tin');
  });
});
