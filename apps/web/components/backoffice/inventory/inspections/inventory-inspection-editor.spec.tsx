import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { InventoryInspectionDetail } from '@/lib/backoffice-inventory-api';
import { InventoryInspectionEditor } from './inventory-inspection-editor';
import { INSPECTION_CHECKS } from './inspection-editor-logic';

describe('FE-06 InventoryInspectionEditor', () => {
  it('renders all 18 grouped controls for a draft inspection', () => {
    const markup = renderToStaticMarkup(
      <InventoryInspectionEditor inspection={inspection()} onComplete={vi.fn()} onSave={vi.fn()} />,
    );

    expect(markup).toContain('18 hạng mục kỹ thuật');
    expect(markup).toContain('Hiển thị và camera');
    expect(markup).toContain('Âm thanh và phím bấm');
    expect(markup).toContain('Kết nối');
    expect(markup).toContain('Pin, cảm biến và kết nối khác');
    expect(markup.match(/Chọn kết quả/g) ?? []).toHaveLength(18);
    expect(markup).toContain('Lưu bản nháp');
    expect(markup).toContain('Hoàn tất kiểm định');
  });

  it('marks non-pass notes required while keeping pass notes optional', () => {
    const items = Object.fromEntries(
      INSPECTION_CHECKS.map((check, index) => [
        check.key,
        { status: index === 0 ? ('DEGRADED' as const) : ('PASS' as const), note: null },
      ]),
    );
    const markup = renderToStaticMarkup(
      <InventoryInspectionEditor
        inspection={inspection({ checks: { schemaVersion: 1, items } })}
        onComplete={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(markup).toContain('id="check-display-note"');
    expect(markup).toMatch(/id="check-display-note"[^>]*required=""/);
    expect(markup).not.toMatch(/id="check-touchscreen-note"[^>]*required=""/);
  });

  it('uses the server-projected checklist label when available', () => {
    const markup = renderToStaticMarkup(
      <InventoryInspectionEditor
        inspection={inspection({
          checklist: {
            schemaVersion: 1,
            items: [
              {
                key: 'DISPLAY',
                label: 'Màn hình theo danh mục kiểm định',
                note: null,
                order: 1,
                status: null,
              },
            ],
          },
        })}
        onComplete={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(markup).toContain('Màn hình theo danh mục kiểm định');
  });

  it('renders completed inspections as read-only results', () => {
    const items = Object.fromEntries(
      INSPECTION_CHECKS.map((check) => [check.key, { status: 'PASS' as const, note: null }]),
    );
    const markup = renderToStaticMarkup(
      <InventoryInspectionEditor
        inspection={inspection({
          batteryHealthPercent: 91,
          checks: { schemaVersion: 1, items },
          conditionGrade: 'A',
          inspectedAt: '2026-08-28T11:00:00.000Z',
          overallResult: 'PASSED',
          status: 'COMPLETED',
        })}
        onComplete={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(markup).toContain('Phiếu đã hoàn tất và không thể chỉnh sửa.');
    expect(markup).toContain('Kết quả 18 hạng mục');
    expect(markup).not.toContain('Lưu bản nháp');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('<textarea');
  });

  it('keeps another employee draft read-only and shows masked unit context', () => {
    const markup = renderToStaticMarkup(
      <InventoryInspectionEditor
        editable={false}
        inspection={inspection()}
        onComplete={vi.fn()}
        onSave={vi.fn()}
        unitSummary={{
          inventoryCode: 'RPH-IP15-001',
          maskedIdentifiers: ['•••• 5678'],
          productName: 'iPhone 15',
          variantName: '128 GB · Đen',
        }}
      />,
    );

    expect(markup).toContain('Phiếu đang do người khác phụ trách');
    expect(markup).toContain('RPH-IP15-001');
    expect(markup).toContain('•••• 5678');
    expect(markup).toContain('Nhân viên Demo');
    expect(markup).not.toContain('Lưu bản nháp');
    expect(markup).not.toContain('<select');
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
    inspector: { employeeCode: 'NV001', fullName: 'Nhân viên Demo', id: 'employee-id' },
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
