import { describe, expect, it } from 'vitest';
import { backofficeWarrantyActions, backofficeWarrantyPolicyActions } from './warranty-actions.js';

describe('warranty authoritative actions', () => {
  it.each([
    { expected: ['VOID'], role: 'ADMIN' as const, status: 'ACTIVE' as const },
    { expected: [], role: 'EMPLOYEE' as const, status: 'ACTIVE' as const },
    { expected: [], role: 'ADMIN' as const, status: 'VOIDED' as const },
  ])('projects warranty actions for $role and $status', ({ expected, role, status }) => {
    expect(backofficeWarrantyActions(status, role)).toEqual(expected);
  });

  it.each([
    {
      blocked: null,
      expected: ['EDIT', 'DEACTIVATE', 'ARCHIVE'],
      policy: { archivedAt: null, status: 'ACTIVE' as const },
      role: 'ADMIN' as const,
    },
    {
      blocked: null,
      expected: ['EDIT', 'ACTIVATE', 'ARCHIVE'],
      policy: { archivedAt: null, status: 'INACTIVE' as const },
      role: 'ADMIN' as const,
    },
    {
      blocked: 'ACTIVE_CATALOG_REFERENCES' as const,
      expected: ['EDIT', 'DEACTIVATE'],
      policy: { archivedAt: null, status: 'ACTIVE' as const },
      role: 'ADMIN' as const,
    },
    {
      blocked: null,
      expected: [],
      policy: { archivedAt: null, status: 'ACTIVE' as const },
      role: 'EMPLOYEE' as const,
    },
    {
      blocked: null,
      expected: [],
      policy: { archivedAt: new Date('2026-08-29T00:00:00.000Z'), status: 'INACTIVE' as const },
      role: 'ADMIN' as const,
    },
  ])(
    'projects policy actions for $role, $policy.status and blocked=$blocked',
    ({ blocked, expected, policy, role }) => {
      expect(backofficeWarrantyPolicyActions(policy, role, blocked)).toEqual(expected);
    },
  );
});
