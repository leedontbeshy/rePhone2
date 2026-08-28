import { describe, expect, it } from 'vitest';
import {
  formatVoucherDateRange,
  voucherDiscountSummary,
  voucherScopeSummary,
  voucherStatusLabel,
  voucherUsageProgress,
  voucherUsageStatusLabel,
  voucherVisibilityLabel,
} from './voucher-admin-ui';

describe('voucher administration presentation', () => {
  it('uses natural Vietnamese labels for lifecycle states', () => {
    expect(voucherStatusLabel('ACTIVE')).toBe('Đang áp dụng');
    expect(voucherStatusLabel('ARCHIVED')).toBe('Đã lưu trữ');
    expect(voucherUsageStatusLabel('RESERVED')).toBe('Đang chờ');
    expect(voucherUsageStatusLabel('RELEASED')).toBe('Đã hoàn lại');
    expect(voucherVisibilityLabel('ACCOUNT_ONLY')).toBe('Chỉ dành cho tài khoản');
  });

  it('summarizes discount and scope without exposing structured values', () => {
    expect(
      voucherDiscountSummary({
        discountType: 'PERCENT',
        discountValue: '10',
        maxDiscountAmount: '1500000',
      }),
    ).toContain('tối đa');
    expect(voucherScopeSummary({ scopeType: 'ORDER', scopeConfig: null })).toBe('Toàn bộ đơn hàng');
    expect(
      voucherScopeSummary({
        scopeType: 'PRODUCT_TYPE',
        scopeConfig: { productType: 'IPHONE' },
      }),
    ).toBe('Dòng iPhone');
    expect(
      voucherScopeSummary({
        scopeType: 'PRODUCTS',
        scopeConfig: { productIds: ['one', 'two'] },
      }),
    ).toBe('2 sản phẩm được chọn');
  });

  it('formats authoritative time windows and clamps usage progress', () => {
    expect(
      formatVoucherDateRange('2026-08-20T00:00:00+07:00', '2026-08-31T23:59:00+07:00'),
    ).toContain('20/08/2026');
    expect(voucherUsageProgress(128, 300)).toBeCloseTo(42.67, 1);
    expect(voucherUsageProgress(4, 0)).toBe(0);
    expect(voucherUsageProgress(400, 300)).toBe(100);
  });
});
