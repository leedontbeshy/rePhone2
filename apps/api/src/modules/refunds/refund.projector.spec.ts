import { describe, expect, it } from 'vitest';
import type { RefundOperationsRecord } from './refund-operations.repository.js';
import {
  availableRefundActions,
  projectRefundDetail,
  projectRefundListItem,
} from './refund.projector.js';

describe('refund projector', () => {
  it.each([
    [
      'requested bank transfer',
      refund({ status: 'REQUESTED' }),
      ['START_PROCESSING', 'REJECT', 'CANCEL'],
    ],
    [
      'requested legacy OTHER',
      refund({ status: 'REQUESTED', method: 'OTHER' }),
      ['REJECT', 'CANCEL'],
    ],
    [
      'processing bank transfer',
      refund({ status: 'PROCESSING', processingAt: timestamp(1) }),
      ['COMPLETE_BANK_TRANSFER'],
    ],
    [
      'processing cash',
      refund({ status: 'PROCESSING', method: 'CASH', processingAt: timestamp(1) }),
      ['COMPLETE_CASH'],
    ],
    [
      'completed bank transfer with evidence',
      refund({
        status: 'COMPLETED',
        processingAt: timestamp(1),
        completedAt: timestamp(2),
        evidenceBucket: 'rephone-private',
        evidenceObjectPath: 'refunds/refund-1/evidence.pdf',
        evidenceMimeType: 'application/pdf',
        evidenceFileSize: 1234,
        evidenceSha256: 'a'.repeat(64),
      }),
      ['VIEW_EVIDENCE'],
    ],
    [
      'completed cash',
      refund({
        status: 'COMPLETED',
        method: 'CASH',
        processingAt: timestamp(1),
        completedAt: timestamp(2),
      }),
      [],
    ],
    [
      'terminal rejected refund',
      refund({ status: 'REJECTED', terminalAt: timestamp(2), terminalReason: 'Không hợp lệ' }),
      [],
    ],
  ] as const)('returns authoritative actions for %s', (_label, record, expected) => {
    expect(availableRefundActions(record, adminViewer())).toEqual(expected);
  });

  it('limits processing completion to the owning employee while preserving admin break-glass', () => {
    const record = refund({
      status: 'PROCESSING',
      method: 'BANK_TRANSFER',
      processedById: 'processor',
      processedBy: actor('processor'),
      processingAt: timestamp(1),
    });

    expect(availableRefundActions(record, employeeViewer('processor'))).toEqual([
      'COMPLETE_BANK_TRANSFER',
    ]);
    expect(availableRefundActions(record, employeeViewer('other-employee'))).toEqual([]);
    expect(availableRefundActions(record, adminViewer())).toEqual(['COMPLETE_BANK_TRANSFER']);
  });

  it('fails closed for non-staff viewers in every state', () => {
    expect(
      availableRefundActions(refund({ status: 'REQUESTED' }), {
        userId: 'customer',
        role: 'CUSTOMER',
      }),
    ).toEqual([]);
  });

  it('projects money, actors and timestamps without leaking private evidence metadata', () => {
    const record = refund({
      status: 'COMPLETED',
      processingAt: timestamp(1),
      completedAt: timestamp(2),
      processedBy: actor('processor'),
      evidenceBucket: 'rephone-private',
      evidenceObjectPath: 'refunds/refund-1/secret-proof.pdf',
      evidenceMimeType: 'application/pdf',
      evidenceFileSize: 1234,
      evidenceSha256: 'b'.repeat(64),
    });

    const result = projectRefundDetail(record, adminViewer());

    expect(result).toMatchObject({
      id: 'refund-1',
      orderNumber: 'RPH-20260824-REFUND01',
      amount: '250000',
      status: 'COMPLETED',
      evidenceAvailable: true,
      processingAt: '2026-08-24T01:00:00.000Z',
      completedAt: '2026-08-24T02:00:00.000Z',
      processor: {
        id: 'processor',
        fullName: 'Nhân viên processor',
        employeeCode: 'NV-processor',
      },
      order: {
        grandTotal: '1000000',
        paidAmount: '500000',
        refundedAmount: '250000',
        balanceDue: '500000',
      },
      payment: {
        expectedAmount: '500000',
        receivedAmount: '500000',
      },
      availableActions: ['VIEW_EVIDENCE'],
    });
    expect(JSON.stringify(result)).not.toContain('secret-proof.pdf');
    expect(result).not.toHaveProperty('evidenceBucket');
    expect(result).not.toHaveProperty('evidenceObjectPath');
    expect(result).not.toHaveProperty('evidenceMimeType');
    expect(result).not.toHaveProperty('evidenceFileSize');
    expect(result).not.toHaveProperty('evidenceSha256');
  });

  it('requires the full evidence fingerprint before exposing evidence availability', () => {
    const incomplete = refund({
      status: 'COMPLETED',
      evidenceBucket: 'rephone-private',
      evidenceObjectPath: 'refunds/refund-1/evidence.pdf',
      evidenceSha256: null,
    });
    const complete = refund({
      status: 'COMPLETED',
      evidenceBucket: 'rephone-private',
      evidenceObjectPath: 'refunds/refund-1/evidence.pdf',
      evidenceMimeType: 'application/pdf',
      evidenceFileSize: 1234,
      evidenceSha256: 'c'.repeat(64),
    });

    expect(projectRefundListItem(incomplete).evidenceAvailable).toBe(false);
    expect(projectRefundListItem(complete).evidenceAvailable).toBe(true);
  });
});

function refund(overrides: Record<string, unknown> = {}): RefundOperationsRecord {
  return {
    id: 'refund-1',
    orderId: 'order-1',
    paymentId: 'payment-1',
    amount: 250_000n,
    method: 'BANK_TRANSFER',
    status: 'REQUESTED',
    reason: 'Khách yêu cầu hoàn tiền',
    note: null,
    requestedByType: 'STAFF',
    requestedById: 'requester',
    processedById: null,
    processingAt: null,
    completedAt: null,
    terminalById: null,
    terminalAt: null,
    terminalReason: null,
    evidenceBucket: null,
    evidenceObjectPath: null,
    evidenceMimeType: null,
    evidenceFileSize: null,
    evidenceSha256: null,
    createdAt: timestamp(0),
    updatedAt: timestamp(0),
    order: {
      id: 'order-1',
      orderNumber: 'RPH-20260824-REFUND01',
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      paymentStatus: 'PARTIALLY_REFUNDED',
      customerName: 'Khách hoàn tiền',
      customerEmail: 'refund@example.com',
      grandTotal: 1_000_000n,
      paidAmount: 500_000n,
      refundedAmount: 250_000n,
      balanceDue: 500_000n,
    },
    payment: {
      id: 'payment-1',
      purpose: 'DEPOSIT',
      method: 'BANK_TRANSFER',
      status: 'VERIFIED',
      expectedAmount: 500_000n,
      receivedAmount: 500_000n,
    },
    requestedBy: actor('requester'),
    processedBy: null,
    terminalBy: null,
    ...overrides,
  } as unknown as RefundOperationsRecord;
}

function actor(id: string) {
  return {
    id,
    fullName: `Nhân viên ${id}`,
    employeeCode: `NV-${id}`,
  };
}

function employeeViewer(userId: string) {
  return { userId, role: 'EMPLOYEE' as const };
}

function adminViewer() {
  return { userId: 'admin', role: 'ADMIN' as const };
}

function timestamp(hour: number): Date {
  return new Date(`2026-08-24T${hour.toString().padStart(2, '0')}:00:00.000Z`);
}
