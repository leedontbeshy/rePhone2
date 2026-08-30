import type { AuthRole } from '@/app/auth-provider';
import type { BackofficeNavigationGroup } from '@/components/shells';
import {
  BACKOFFICE_AUDIT_LOGS_ROOT,
  BACKOFFICE_CUSTOMERS_ROOT,
  BACKOFFICE_EMPLOYEES_ROOT,
  BACKOFFICE_SETTINGS_ROOT,
  BACKOFFICE_SYSTEM_HEALTH_ROOT,
  backofficeNavigationForRole,
} from '../backoffice-navigation';

export {
  BACKOFFICE_AUDIT_LOGS_ROOT as SYSTEM_ADMIN_AUDIT_LOGS_ROOT,
  BACKOFFICE_CUSTOMERS_ROOT as SYSTEM_ADMIN_CUSTOMERS_ROOT,
  BACKOFFICE_EMPLOYEES_ROOT as SYSTEM_ADMIN_EMPLOYEES_ROOT,
  BACKOFFICE_SETTINGS_ROOT as SYSTEM_ADMIN_SETTINGS_ROOT,
  BACKOFFICE_SYSTEM_HEALTH_ROOT as SYSTEM_ADMIN_HEALTH_ROOT,
};

export type SystemAdminAccess = 'staff' | 'admin' | 'none';

export interface SystemNavigationOverflowState {
  readonly canScrollEnd: boolean;
  readonly canScrollStart: boolean;
}

export function systemAdminNavigationForRole(
  role: AuthRole | null | undefined,
  pathname: string,
): readonly BackofficeNavigationGroup[] {
  return backofficeNavigationForRole(role, pathname);
}

export function systemAdminAccessForPath(pathname: string): SystemAdminAccess {
  if (isPathWithin(pathname, BACKOFFICE_CUSTOMERS_ROOT)) return 'staff';
  if (
    [
      BACKOFFICE_EMPLOYEES_ROOT,
      BACKOFFICE_SETTINGS_ROOT,
      BACKOFFICE_AUDIT_LOGS_ROOT,
      BACKOFFICE_SYSTEM_HEALTH_ROOT,
    ].some((root) => isPathWithin(pathname, root))
  ) {
    return 'admin';
  }
  return 'none';
}

export function canAccessSystemAdminPath(
  role: AuthRole | null | undefined,
  pathname: string,
): boolean {
  const access = systemAdminAccessForPath(pathname);
  if (access === 'admin') return role === 'ADMIN';
  if (access === 'staff') return role === 'EMPLOYEE' || role === 'ADMIN';
  return false;
}

export function systemNavigationOverflowState({
  clientWidth,
  scrollLeft,
  scrollWidth,
}: Readonly<{
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
}>): SystemNavigationOverflowState {
  const maximumScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const normalizedScrollLeft = Math.max(0, Math.min(scrollLeft, maximumScrollLeft));
  return {
    canScrollEnd: normalizedScrollLeft < maximumScrollLeft - 1,
    canScrollStart: normalizedScrollLeft > 1,
  };
}

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}
