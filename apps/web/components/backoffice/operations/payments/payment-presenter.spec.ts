import { describe, expect, it } from 'vitest';
import {
  PAYMENT_DEFAULT_QUERY,
  paymentFulfillmentStatusLabel,
  paymentMethodLabel,
  paymentOrderPaymentStatusLabel,
  paymentQueryFromSearch,
  paymentQueryHref,
  paymentStatusPresentation,
} from './payment-presenter';

describe('FE-07 payment presenter', () => {
  it('uses natural Vietnamese labels instead of raw operation states', () => {
    expect(paymentStatusPresentation('UNDER_REVIEW')).toEqual({
      label: 'Chờ kiểm tra',
      tone: 'warning',
    });
    expect(paymentMethodLabel('COD')).toBe('Thanh toán khi nhận hàng');
    expect(paymentFulfillmentStatusLabel('IN_TRANSIT')).toBe('Đang giao hàng');
    expect(paymentOrderPaymentStatusLabel('PARTIALLY_PAID')).toBe('Đã thanh toán một phần');
  });

  it('parses safe URL filters and falls back from invalid values', () => {
    const query = paymentQueryFromSearch(
      new URLSearchParams(
        'status=VERIFIED&method=CASH&reviewOverdue=true&page=3&sortBy=expectedAmount&sortOrder=desc',
      ),
    );

    expect(query).toMatchObject({
      status: 'VERIFIED',
      method: 'CASH',
      reviewOverdue: true,
      page: 3,
      sortBy: 'expectedAmount',
      sortOrder: 'desc',
    });
    expect(paymentQueryFromSearch(new URLSearchParams('status=RAW&page=-4'))).toMatchObject(
      PAYMENT_DEFAULT_QUERY,
    );
  });

  it('builds a shareable filter URL without default noise', () => {
    expect(paymentQueryHref(PAYMENT_DEFAULT_QUERY)).toBe(
      '/backoffice/payments?status=UNDER_REVIEW',
    );
    expect(paymentQueryHref({ ...PAYMENT_DEFAULT_QUERY, page: 4 }, 2)).toBe(
      '/backoffice/payments?status=UNDER_REVIEW&page=2',
    );
    expect(
      paymentQueryFromSearch(
        new URLSearchParams(
          paymentQueryHref({ ...PAYMENT_DEFAULT_QUERY, status: '' }).split('?')[1],
        ),
      ),
    ).toMatchObject({ status: '' });
  });
});
