import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Voucher } from '@/lib/backoffice-voucher-api';
import { VoucherBoardCard } from './voucher-list-view';

const VOUCHER: Voucher = {
  code: 'THANG9',
  createdAt: '2026-08-28T00:00:00.000Z',
  description: null,
  discountType: 'PERCENT',
  discountValue: '10',
  endsAt: '2026-09-30T23:59:59.000Z',
  id: 'voucher-1',
  maxDiscountAmount: '1000000',
  minimumOrderAmount: '0',
  name: 'Ưu đãi tháng 9',
  perCustomerLimit: null,
  scopeConfig: null,
  scopeType: 'ORDER',
  startsAt: '2026-09-01T00:00:00.000Z',
  status: 'ACTIVE',
  totalUsageLimit: 100,
  updatedAt: '2026-08-28T00:00:00.000Z',
  usageCounts: { consumed: 12, released: 0, reserved: 1 },
  visibility: 'PUBLIC',
};

describe('voucher list loading boundary', () => {
  it('keeps an already loaded voucher card as a normal detail link', () => {
    const markup = renderToStaticMarkup(<VoucherBoardCard voucher={VOUCHER} />);

    expect(markup).toContain('href="/backoffice/vouchers/voucher-1"');
    expect(markup).not.toContain('aria-disabled');
    expect(markup).not.toContain('tabindex="-1"');
  });
});
