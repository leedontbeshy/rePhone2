import { describe, expect, it } from 'vitest';
import type { RefundDetail } from '@/lib/refund-api';
import {
  REFUND_DEFAULT_QUERY,
  refundFulfillmentStatusLabel,
  refundMethodLabel,
  refundOrderStatusLabel,
  refundPaymentStatusLabel,
  refundPrimaryAction,
  refundQueryFromSearch,
  refundQueryHref,
  refundStatusPresentation,
  refundTimeline,
} from './refund-presenter';

describe('FE-07 refund presenter', () => {
  it('uses natural Vietnamese labels instead of raw operation states', () => {
    expect(refundStatusPresentation('PROCESSING')).toEqual({
      label: 'Đang xử lý',
      tone: 'info',
    });
    expect(refundMethodLabel('OTHER')).toBe('Phương thức khác');
    expect(refundOrderStatusLabel('CANCELLED')).toBe('Đã hủy');
    expect(refundFulfillmentStatusLabel('IN_TRANSIT')).toBe('Đang giao hàng');
    expect(refundFulfillmentStatusLabel('COMPLETED')).toBe('Đã hoàn tất giao nhận');
    expect(refundPaymentStatusLabel('PARTIALLY_REFUNDED')).toBe('Đã hoàn một phần');
  });

  it('chooses one primary action only from the authoritative list', () => {
    expect(refundPrimaryAction(['START_PROCESSING', 'REJECT', 'CANCEL'])).toBe('START_PROCESSING');
    expect(refundPrimaryAction(['COMPLETE_BANK_TRANSFER'])).toBe('COMPLETE_BANK_TRANSFER');
    expect(refundPrimaryAction(['VIEW_EVIDENCE'])).toBeNull();
    expect(refundPrimaryAction(['REJECT', 'CANCEL'])).toBe('REJECT');
  });

  it('parses safe URL filters and falls back from invalid values', () => {
    const query = refundQueryFromSearch(
      new URLSearchParams(
        'status=COMPLETED&method=CASH&page=3&sortBy=amount&sortOrder=desc&orderNumber=rph-123',
      ),
    );

    expect(query).toMatchObject({
      status: 'COMPLETED',
      method: 'CASH',
      page: 3,
      sortBy: 'amount',
      sortOrder: 'desc',
      orderNumber: 'RPH-123',
    });
    expect(refundQueryFromSearch(new URLSearchParams('status=RAW&page=-4'))).toMatchObject(
      REFUND_DEFAULT_QUERY,
    );
    const sanitized = refundQueryFromSearch(
      new URLSearchParams(`orderNumber=${'r'.repeat(80)}&createdFrom=August+29,+2026`),
    );
    expect(sanitized.orderNumber).toBe('R'.repeat(64));
    expect(sanitized).not.toHaveProperty('createdFrom');
  });

  it('builds a shareable filter URL without default sort noise', () => {
    expect(refundQueryHref(REFUND_DEFAULT_QUERY)).toBe('/backoffice/refunds?status=REQUESTED');
    expect(refundQueryHref({ ...REFUND_DEFAULT_QUERY, page: 4 }, 2)).toBe(
      '/backoffice/refunds?status=REQUESTED&page=2',
    );
  });

  it('round-trips the explicit all-status filter instead of restoring the default queue', () => {
    const href = refundQueryHref({ ...REFUND_DEFAULT_QUERY, status: '' });

    expect(href).toBe('/backoffice/refunds?status=all');
    expect(refundQueryFromSearch(new URL(href, 'https://rephone.test').searchParams).status).toBe(
      '',
    );
  });

  it('derives the timeline only from flat server timestamps', () => {
    const detail = refundDetail({
      status: 'COMPLETED',
      processingAt: '2026-08-29T08:10:00.000Z',
      completedAt: '2026-08-29T08:30:00.000Z',
      processor: { id: 'staff-id', fullName: 'Nhân viên Demo', employeeCode: 'EMP001' },
    });

    expect(refundTimeline(detail).map((item) => item.label)).toEqual([
      'Đã tạo yêu cầu',
      'Bắt đầu xử lý',
      'Đã hoàn tiền',
    ]);
    expect(refundTimeline(detail)[1]?.description).toBe('Người xử lý: Nhân viên Demo');
  });
});

function refundDetail(overrides: Partial<RefundDetail> = {}): RefundDetail {
  return {
    id: 'refund-id',
    orderNumber: 'RPH-20260829-ABC123',
    amount: '3000000',
    method: 'BANK_TRANSFER',
    status: 'REQUESTED',
    requestedByType: 'STAFF',
    requester: null,
    evidenceAvailable: false,
    processingAt: null,
    completedAt: null,
    terminalAt: null,
    createdAt: '2026-08-29T08:00:00.000Z',
    reason: 'Hoàn cọc cho đơn hàng đã hủy',
    note: null,
    processor: null,
    terminalActor: null,
    terminalReason: null,
    availableActions: ['START_PROCESSING', 'REJECT', 'CANCEL'],
    order: {
      id: 'order-id',
      orderNumber: 'RPH-20260829-ABC123',
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      customerName: 'Khách Demo',
      customerEmail: 'khach@example.com',
      grandTotal: '15990000',
      paidAmount: '3000000',
      refundedAmount: '0',
      balanceDue: '12990000',
    },
    payment: null,
    ...overrides,
  };
}
