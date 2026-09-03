import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BackofficePaymentDetail } from '@/lib/payment-api';
import { PaymentRecord, runExclusivePaymentOperation } from './payment-detail-view';

describe('FE-07 payment detail view', () => {
  it('shows only actions granted by the server projection', () => {
    const markup = renderToStaticMarkup(
      <PaymentRecord
        busy={null}
        detail={paymentDetail(['VERIFY', 'REJECT', 'VIEW_EVIDENCE'])}
        onEvidence={vi.fn()}
        onOpenDecision={vi.fn()}
      />,
    );

    expect(markup).toContain('Xử lý thanh toán');
    expect(markup).toContain('Xác nhận thanh toán');
    expect(markup).toContain('Từ chối minh chứng');
    expect(markup).toContain('Mở minh chứng');
    expect(markup).not.toContain('UNDER_REVIEW');
    expect(markup).not.toContain('BANK_TRANSFER');
  });

  it('keeps a terminal record read-only while retaining evidence history', () => {
    const markup = renderToStaticMarkup(
      <PaymentRecord
        busy={null}
        detail={paymentDetail(['VIEW_EVIDENCE'], 'VERIFIED')}
        onEvidence={vi.fn()}
        onOpenDecision={vi.fn()}
      />,
    );

    expect(markup).toContain('Hồ sơ hiện không còn thao tác cần xử lý.');
    expect(markup).toContain('Mở minh chứng');
    expect(markup).not.toContain('Xác nhận thanh toán');
    expect(markup).not.toContain('Từ chối minh chứng');
  });

  it.each(['verify', 'evidence'] as const)(
    'locks a deferred %s request against a same-frame duplicate',
    async (operation) => {
      const lock: { current: 'verify' | 'reject' | 'evidence' | null } = { current: null };
      const response = deferred<undefined>();
      const request = vi.fn(() => response.promise);

      const first = runExclusivePaymentOperation(lock, operation, true, request);
      const duplicate = runExclusivePaymentOperation(lock, operation, true, request);

      expect(request).toHaveBeenCalledOnce();
      await expect(duplicate).resolves.toBe(false);
      response.resolve(undefined);
      await expect(first).resolves.toBe(true);
      expect(lock.current).toBeNull();
    },
  );

  it('does not call a financial request when the authoritative action is unavailable', async () => {
    const request = vi.fn(() => Promise.resolve());

    await expect(
      runExclusivePaymentOperation({ current: null }, 'verify', false, request),
    ).resolves.toBe(false);

    expect(request).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function paymentDetail(
  availableActions: BackofficePaymentDetail['availableActions'],
  status: BackofficePaymentDetail['payment']['status'] = 'UNDER_REVIEW',
): BackofficePaymentDetail {
  return {
    availableActions,
    evidenceAvailable: true,
    order: {
      orderNumber: 'RPH-20260829-ABC123',
      status: 'PLACED',
      fulfillmentStatus: 'PENDING',
      paymentStatus: 'DEPOSIT_PENDING',
      grandTotal: '15990000',
      depositRequired: '3000000',
      paidAmount: status === 'VERIFIED' ? '3000000' : '0',
      refundedAmount: '0',
      balanceDue: status === 'VERIFIED' ? '12990000' : '15990000',
      contact: {
        fullName: 'Nguyễn Văn An',
        email: 'an@example.com',
        phone: '0900000000',
      },
      items: [
        {
          id: 'item-id',
          productName: 'iPhone 15 Pro',
          variantName: '256 GB Titan tự nhiên',
          quantity: 1,
          lineTotal: '15990000',
        },
      ],
    },
    payment: {
      id: 'payment-id',
      orderNumber: 'RPH-20260829-ABC123',
      purpose: 'DEPOSIT',
      method: 'BANK_TRANSFER',
      status,
      expectedAmount: '3000000',
      receivedAmount: status === 'VERIFIED' ? '3000000' : null,
      transferContent: 'RPHABC123',
      bankTransferInstructions: null,
      expiresAt: null,
      submittedAt: '2026-08-29T08:20:00.000Z',
      reviewSlaDueAt: '2026-08-29T09:20:00.000Z',
      reviewOverdue: false,
      rejectionReason: null,
    },
    reviewedAt: status === 'VERIFIED' ? '2026-08-29T08:30:00.000Z' : null,
    reviewer: status === 'VERIFIED' ? { id: 'staff-id', fullName: 'Nhân viên Demo' } : null,
    reviewNote: null,
    timeline: [{ label: 'Đã nộp minh chứng', at: '2026-08-29T08:20:00.000Z' }],
  };
}
