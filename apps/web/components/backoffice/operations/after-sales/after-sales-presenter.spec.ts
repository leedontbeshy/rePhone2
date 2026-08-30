import { describe, expect, it } from 'vitest';
import type { AfterSalesDetail } from '@/lib/after-sales-backoffice-api';
import {
  afterSalesPrimaryStep,
  afterSalesStatusPresentation,
  afterSalesTimeline,
  afterSalesTypeLabel,
  isAfterSalesTerminal,
} from './after-sales-presenter';

describe('after-sales presenter', () => {
  it('maps internal values to Vietnamese labels', () => {
    expect(afterSalesTypeLabel('EXCHANGE')).toBe('Đổi sản phẩm');
    expect(afterSalesStatusPresentation('INSPECTING')).toEqual({
      label: 'Đang kiểm tra',
      tone: 'info',
    });
  });

  it('selects one primary step from server actions', () => {
    expect(afterSalesPrimaryStep(detail({ availableActions: ['RECEIVE'] }))).toBe('RECEIVE');
    expect(
      afterSalesPrimaryStep(
        detail({
          availableActions: [],
          inspection: {
            id: 'inspection-1',
            inspectedAt: null,
            inspector: { fullName: 'Kỹ thuật viên', id: 'employee-1' },
            overallResult: 'INCOMPLETE',
            status: 'DRAFT',
            type: 'WARRANTY',
          },
          status: 'INSPECTING',
        }),
      ),
    ).toBe('INSPECTION');
    expect(afterSalesPrimaryStep(detail({ availableActions: ['RESOLVE_REPAIRED'] }))).toBe(
      'RESOLVE',
    );
  });

  it('advances an accessory case to approval after its summary is already available', () => {
    expect(
      afterSalesPrimaryStep(
        detail({
          availableActions: ['ASSIGN', 'RECORD_INSPECTION_SUMMARY', 'APPROVE', 'REJECT'],
          inspectionSummary: 'Phụ kiện đã được kiểm tra đầy đủ.',
          status: 'INSPECTING',
        }),
      ),
    ).toBe('APPROVE');
  });

  it('marks terminal records read-only and builds a Vietnamese timeline', () => {
    const resolved = detail({
      availableActions: [],
      resolutionNote: 'Đã sửa xong và bàn giao.',
      resolutionType: 'REPAIRED',
      status: 'RESOLVED',
      timeline: {
        cancelledAt: null,
        decidedAt: '2026-08-29T03:00:00.000Z',
        inspectedAt: '2026-08-29T02:00:00.000Z',
        receivedAt: '2026-08-29T01:00:00.000Z',
        requestedAt: '2026-08-29T00:00:00.000Z',
        resolvedAt: '2026-08-29T04:00:00.000Z',
        returnedAt: null,
      },
    });

    expect(isAfterSalesTerminal(resolved.status)).toBe(true);
    expect(afterSalesPrimaryStep(resolved)).toBe('TERMINAL');
    expect(afterSalesTimeline(resolved).map((item) => item.label)).toContain(
      'Đã hoàn tất · Đã sửa chữa',
    );
  });
});

function detail(overrides: Partial<AfterSalesDetail> = {}): AfterSalesDetail {
  return {
    assignedTo: null,
    attachmentCount: 0,
    attachments: [],
    availableActions: ['RECEIVE'],
    cancelReason: null,
    customer: {
      email: 'khach@example.com',
      id: 'customer-1',
      name: 'Khách hàng Demo',
      phone: '0900000000',
    },
    decisionNote: null,
    decidedBy: null,
    id: 'case-1',
    inspection: null,
    inspectionSummary: null,
    issueDescription: 'Máy không sạc được.',
    orderItem: {
      id: 'item-1',
      inventoryCode: 'RPH-U-001',
      orderNumber: 'RPH-20260829-ABCDEFGH',
      productName: 'iPhone 15',
      quantity: 1,
      variantName: '128 GB Đen',
    },
    receiveNote: null,
    receivedBy: null,
    receivedLocation: null,
    refund: null,
    replacementUnit: null,
    requestNumber: 'RPH-AS-20260829-0001',
    requestedAt: '2026-08-29T00:00:00.000Z',
    requestedResolution: null,
    resolutionNote: null,
    resolutionType: null,
    resolvedBy: null,
    returnNote: null,
    status: 'REQUESTED',
    timeline: {
      cancelledAt: null,
      decidedAt: null,
      inspectedAt: null,
      receivedAt: null,
      requestedAt: '2026-08-29T00:00:00.000Z',
      resolvedAt: null,
      returnedAt: null,
    },
    type: 'WARRANTY',
    updatedAt: '2026-08-29T00:00:00.000Z',
    warranty: null,
    ...overrides,
  };
}
