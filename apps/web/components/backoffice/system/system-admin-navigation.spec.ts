import { describe, expect, it } from 'vitest';
import {
  canAccessSystemAdminPath,
  SYSTEM_ADMIN_AUDIT_LOGS_ROOT,
  SYSTEM_ADMIN_CUSTOMERS_ROOT,
  SYSTEM_ADMIN_EMPLOYEES_ROOT,
  SYSTEM_ADMIN_HEALTH_ROOT,
  SYSTEM_ADMIN_SETTINGS_ROOT,
  systemAdminAccessForPath,
  systemAdminNavigationForRole,
} from './system-admin-navigation';

describe('FE-08 system administration navigation', () => {
  it('adds the five approved destinations and keeps a nested audit route current', () => {
    const groups = systemAdminNavigationForRole(
      'ADMIN',
      `${SYSTEM_ADMIN_AUDIT_LOGS_ROOT}/audit-id`,
    );
    const systemGroup = groups.find((group) => group.label === 'Hệ thống');

    expect(systemGroup?.items).toMatchObject([
      { href: SYSTEM_ADMIN_EMPLOYEES_ROOT, icon: 'employees', label: 'Nhân viên' },
      { href: SYSTEM_ADMIN_CUSTOMERS_ROOT, icon: 'customers', label: 'Khách hàng' },
      { href: SYSTEM_ADMIN_SETTINGS_ROOT, icon: 'settings', label: 'Cấu hình cửa hàng' },
      {
        href: SYSTEM_ADMIN_AUDIT_LOGS_ROOT,
        icon: 'audit-logs',
        isCurrent: true,
        label: 'Nhật ký hoạt động',
      },
      {
        href: SYSTEM_ADMIN_HEALTH_ROOT,
        icon: 'system-health',
        label: 'Trạng thái hệ thống',
      },
    ]);
    expect(groups.flatMap((group) => group.items).filter((item) => item.isCurrent)).toHaveLength(1);
  });

  it('allows employees to inspect customers while disabling every admin-only destination', () => {
    const groups = systemAdminNavigationForRole('EMPLOYEE', SYSTEM_ADMIN_CUSTOMERS_ROOT);
    const items = groups.find((group) => group.label === 'Hệ thống')?.items ?? [];

    const customers = items.find((item) => item.href === SYSTEM_ADMIN_CUSTOMERS_ROOT);
    expect(customers).toMatchObject({ isCurrent: true });
    expect(customers?.isDisabled).toBeFalsy();
    for (const href of [
      SYSTEM_ADMIN_EMPLOYEES_ROOT,
      SYSTEM_ADMIN_SETTINGS_ROOT,
      SYSTEM_ADMIN_AUDIT_LOGS_ROOT,
      SYSTEM_ADMIN_HEALTH_ROOT,
    ]) {
      expect(items.find((item) => item.href === href)?.isDisabled).toBe(true);
    }
  });

  it('enforces the exact path and role matrix with an unknown-path fail-closed default', () => {
    expect(systemAdminAccessForPath(SYSTEM_ADMIN_CUSTOMERS_ROOT)).toBe('staff');
    expect(systemAdminAccessForPath(`${SYSTEM_ADMIN_AUDIT_LOGS_ROOT}/audit-id`)).toBe('admin');
    expect(systemAdminAccessForPath('/backoffice/system/unknown')).toBe('none');

    expect(canAccessSystemAdminPath('EMPLOYEE', SYSTEM_ADMIN_CUSTOMERS_ROOT)).toBe(true);
    expect(canAccessSystemAdminPath('ADMIN', SYSTEM_ADMIN_CUSTOMERS_ROOT)).toBe(true);
    expect(canAccessSystemAdminPath('EMPLOYEE', SYSTEM_ADMIN_EMPLOYEES_ROOT)).toBe(false);
    expect(canAccessSystemAdminPath('ADMIN', SYSTEM_ADMIN_EMPLOYEES_ROOT)).toBe(true);
    expect(canAccessSystemAdminPath('CUSTOMER', SYSTEM_ADMIN_CUSTOMERS_ROOT)).toBe(false);
    expect(canAccessSystemAdminPath('ADMIN', '/backoffice/system/unknown')).toBe(false);
    expect(canAccessSystemAdminPath(null, SYSTEM_ADMIN_HEALTH_ROOT)).toBe(false);
  });

  it('does not expose management navigation to customer or anonymous sessions', () => {
    expect(systemAdminNavigationForRole('CUSTOMER', SYSTEM_ADMIN_CUSTOMERS_ROOT)).toEqual([]);
    expect(systemAdminNavigationForRole(null, SYSTEM_ADMIN_CUSTOMERS_ROOT)).toEqual([]);
  });
});
