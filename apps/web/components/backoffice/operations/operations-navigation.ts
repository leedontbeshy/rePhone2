import type { AuthRole } from '@/app/auth-provider';
import type { BackofficeNavigationGroup } from '@/components/shells';
import {
  BACKOFFICE_AFTER_SALES_ROOT,
  BACKOFFICE_ORDERS_ROOT,
  BACKOFFICE_PAYMENTS_ROOT,
  BACKOFFICE_REFUNDS_ROOT,
  BACKOFFICE_WARRANTIES_ROOT,
  BACKOFFICE_WARRANTY_POLICIES_ROOT,
  backofficeNavigationForRole,
  canAccessBackofficeNavigation,
} from '../backoffice-navigation';

export const OPERATIONS_ORDERS_ROOT = BACKOFFICE_ORDERS_ROOT;
export const OPERATIONS_PAYMENTS_ROOT = BACKOFFICE_PAYMENTS_ROOT;
export const OPERATIONS_REFUNDS_ROOT = BACKOFFICE_REFUNDS_ROOT;
export const OPERATIONS_AFTER_SALES_ROOT = BACKOFFICE_AFTER_SALES_ROOT;
export const OPERATIONS_WARRANTIES_ROOT = BACKOFFICE_WARRANTIES_ROOT;
export const OPERATIONS_WARRANTY_POLICIES_ROOT = BACKOFFICE_WARRANTY_POLICIES_ROOT;

export function operationsNavigationForRole(
  role: AuthRole | null | undefined,
  pathname: string,
): readonly BackofficeNavigationGroup[] {
  return backofficeNavigationForRole(role, pathname);
}

export function canAccessOperationsWorkspace(role: AuthRole | null | undefined): boolean {
  return canAccessBackofficeNavigation(role);
}
