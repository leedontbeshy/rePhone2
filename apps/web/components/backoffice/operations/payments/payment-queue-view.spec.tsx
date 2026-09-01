import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PaymentQueueItem } from '@/lib/payment-api';
import { PaymentQueueTable } from './payment-queue-view';

describe('payment queue view', () => {
  it('keeps existing queue rows visible while a URL-driven refresh is loading', () => {
    const markup = renderToStaticMarkup(
      <PaymentQueueTable loading payments={[paymentQueueItem()]} />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('RPH-20260902-PAYMENT');
    expect(markup).toContain('Đang cập nhật dữ liệu');
    expect(markup).not.toContain('BANK_TRANSFER');
  });
});

function paymentQueueItem(): PaymentQueueItem {
  return {
    bankTransferInstructions: null,
    contactEmail: 'khach@example.com',
    contactName: 'Khách Demo',
    createdAt: '2026-09-02T01:00:00.000Z',
    expectedAmount: '1000000',
    expiresAt: null,
    id: 'payment-1',
    method: 'BANK_TRANSFER',
    orderNumber: 'RPH-20260902-PAYMENT',
    purpose: 'DEPOSIT',
    receivedAmount: null,
    rejectionReason: null,
    reviewOverdue: false,
    reviewSlaDueAt: '2026-09-02T01:30:00.000Z',
    status: 'UNDER_REVIEW',
    submittedAt: '2026-09-02T01:00:00.000Z',
    transferContent: 'RPH20260902PAYMENT',
  };
}
