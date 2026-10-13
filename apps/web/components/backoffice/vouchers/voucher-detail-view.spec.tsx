import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Pagination, Voucher, VoucherUsage } from '@/lib/backoffice-voucher-api';
import { VoucherSummary } from './voucher-detail-view';

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
  usageCounts: { consumed: 1, released: 0, reserved: 0 },
  visibility: 'PUBLIC',
};

const USAGE: VoucherUsage = {
  consumedAt: '2026-09-01T03:00:00.000Z',
  createdAt: '2026-09-01T02:00:00.000Z',
  customerEmail: 'khach@example.com',
  customerName: 'Khách hàng',
  id: 'usage-1',
  orderId: 'order-1',
  orderNumber: 'RPH-001',
  releasedAt: null,
  status: 'CONSUMED',
};

const PAGINATION: Pagination = {
  page: 1,
  pageSize: 10,
  totalItems: 1,
  totalPages: 1,
};

describe('voucher usage history boundary', () => {
  it('keeps loaded rows visible and renders a local retry when refreshing usages fails', () => {
    const markup = renderToStaticMarkup(
      <VoucherSummary
        usageError="Kết nối lịch sử sử dụng bị gián đoạn."
        usageLoading={false}
        usagePage={1}
        usagePagination={PAGINATION}
        usageStatus=""
        usages={[USAGE]}
        voucher={VOUCHER}
        onArchive={vi.fn()}
        onUsagePageChange={vi.fn()}
        onUsageRetry={vi.fn()}
        onUsageStatusChange={vi.fn()}
      />,
    );

    expect(markup).toContain('Chưa tải được lịch sử sử dụng');
    expect(markup).toContain('Kết nối lịch sử sử dụng bị gián đoạn.');
    expect(markup).toContain('RPH-001');
    expect(markup).toContain('data-label="Đơn hàng" data-mobile-role="primary"');
    expect(markup).toContain('data-label="Khách hàng"');
    expect(markup).toContain('data-label="Trạng thái"');
    expect(markup).toContain('data-label="Thời gian"');
    expect(markup).toContain('href="/backoffice/orders/order-1"');
    expect(markup).toContain('Thử lại');
  });
});
