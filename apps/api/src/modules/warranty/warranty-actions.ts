import type { UserRole, WarrantyStatus } from '../../generated/prisma/enums.js';
import type { WarrantyPolicyRecord } from './warranty-operations.repository.js';

export const BACKOFFICE_WARRANTY_ACTIONS = ['VOID'] as const;
export type BackofficeWarrantyAction = (typeof BACKOFFICE_WARRANTY_ACTIONS)[number];

export const BACKOFFICE_WARRANTY_POLICY_ACTIONS = [
  'EDIT',
  'ACTIVATE',
  'DEACTIVATE',
  'ARCHIVE',
] as const;
export type BackofficeWarrantyPolicyAction = (typeof BACKOFFICE_WARRANTY_POLICY_ACTIONS)[number];

export const WARRANTY_POLICY_ARCHIVE_BLOCKED_REASONS = ['ACTIVE_CATALOG_REFERENCES'] as const;
export type WarrantyPolicyArchiveBlockedReason =
  (typeof WARRANTY_POLICY_ARCHIVE_BLOCKED_REASONS)[number];

export function backofficeWarrantyActions(
  status: WarrantyStatus,
  role: UserRole,
): BackofficeWarrantyAction[] {
  return role === 'ADMIN' && status === 'ACTIVE' ? ['VOID'] : [];
}

export function backofficeWarrantyPolicyActions(
  policy: Pick<WarrantyPolicyRecord, 'archivedAt' | 'status'>,
  role: UserRole,
  archiveBlockedReason: WarrantyPolicyArchiveBlockedReason | null,
): BackofficeWarrantyPolicyAction[] {
  if (role !== 'ADMIN' || policy.archivedAt !== null) return [];

  return [
    'EDIT',
    policy.status === 'ACTIVE' ? 'DEACTIVATE' : 'ACTIVATE',
    ...(archiveBlockedReason === null ? (['ARCHIVE'] as const) : []),
  ];
}
