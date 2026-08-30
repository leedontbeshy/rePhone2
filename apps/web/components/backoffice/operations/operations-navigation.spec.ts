import { describe, expect, it } from 'vitest';
import {
  canAccessOperationsWorkspace,
  OPERATIONS_AFTER_SALES_ROOT,
  OPERATIONS_ORDERS_ROOT,
  OPERATIONS_PAYMENTS_ROOT,
  OPERATIONS_REFUNDS_ROOT,
  OPERATIONS_WARRANTIES_ROOT,
  OPERATIONS_WARRANTY_POLICIES_ROOT,
  operationsNavigationForRole,
} from './operations-navigation';

describe('FE-07 operations navigation', () => {
  it('groups the approved Vietnamese destinations in a stable order', () => {
    const groups = operationsNavigationForRole('ADMIN', OPERATIONS_ORDERS_ROOT);

    expect(groups.map((group) => group.label)).toEqual([
      'Vận hành',
      'Kho hàng',
      'Đơn hàng',
      'Sau mua',
      'Hệ thống',
    ]);
    expect(
      groups.flatMap((group) => group.items).map(({ href, label }) => ({ href, label })),
    ).toEqual([
      { href: '/backoffice', label: 'Tổng quan' },
      { href: '/backoffice/catalog/products', label: 'Danh mục' },
      { href: '/backoffice/vouchers', label: 'Mã ưu đãi' },
      { href: '/backoffice/inventory/units', label: 'Máy vật lý' },
      { href: '/backoffice/inventory/intake', label: 'Nhập máy' },
      { href: '/backoffice/inventory/lookup', label: 'Tra cứu mã' },
      { href: '/backoffice/inventory/stock', label: 'Tồn phụ kiện' },
      { href: '/backoffice/inventory/stock/movements', label: 'Lịch sử kho' },
      { href: '/backoffice/inventory/locations', label: 'Địa điểm' },
      { href: OPERATIONS_ORDERS_ROOT, label: 'Danh sách đơn hàng' },
      { href: OPERATIONS_PAYMENTS_ROOT, label: 'Duyệt thanh toán' },
      { href: OPERATIONS_REFUNDS_ROOT, label: 'Hoàn tiền' },
      { href: OPERATIONS_AFTER_SALES_ROOT, label: 'Hỗ trợ sau mua' },
      { href: OPERATIONS_WARRANTIES_ROOT, label: 'Bảo hành' },
      { href: OPERATIONS_WARRANTY_POLICIES_ROOT, label: 'Chính sách bảo hành' },
      { href: '/backoffice/employees', label: 'Nhân viên' },
      { href: '/backoffice/customers', label: 'Khách hàng' },
      { href: '/backoffice/settings', label: 'Cấu hình cửa hàng' },
      { href: '/backoffice/audit-logs', label: 'Nhật ký hoạt động' },
      { href: '/backoffice/system/health', label: 'Trạng thái hệ thống' },
    ]);
  });

  it('keeps a detail route attached to its owning destination', () => {
    const groups = operationsNavigationForRole('EMPLOYEE', `${OPERATIONS_REFUNDS_ROOT}/refund-id`);
    const refund = groups
      .flatMap((group) => group.items)
      .find((item) => item.href === OPERATIONS_REFUNDS_ROOT);

    expect(refund?.isCurrent).toBe(true);
    expect(groups.flatMap((group) => group.items).filter((item) => item.isCurrent)).toHaveLength(1);
  });

  it('keeps voucher management visible but unavailable to employees', () => {
    const groups = operationsNavigationForRole('EMPLOYEE', OPERATIONS_ORDERS_ROOT);
    const voucher = groups
      .flatMap((group) => group.items)
      .find((item) => item.href === '/backoffice/vouchers');

    expect(voucher?.isDisabled).toBe(true);
  });

  it('keeps system administration visible while only customer lookup remains available to staff', () => {
    const items = operationsNavigationForRole('EMPLOYEE', OPERATIONS_ORDERS_ROOT).flatMap(
      (group) => group.items,
    );

    expect(items.find((item) => item.href === '/backoffice/customers')?.isDisabled).toBeFalsy();
    for (const href of [
      '/backoffice/employees',
      '/backoffice/settings',
      '/backoffice/audit-logs',
      '/backoffice/system/health',
    ]) {
      expect(items.find((item) => item.href === href)?.isDisabled).toBe(true);
    }
  });

  it('allows employees and administrators while rejecting customer and anonymous roles', () => {
    expect(canAccessOperationsWorkspace('EMPLOYEE')).toBe(true);
    expect(canAccessOperationsWorkspace('ADMIN')).toBe(true);
    expect(canAccessOperationsWorkspace('CUSTOMER')).toBe(false);
    expect(canAccessOperationsWorkspace(null)).toBe(false);
  });
});
