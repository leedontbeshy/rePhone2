import { describe, expect, it } from 'vitest';
import type { User } from '../../generated/prisma/client.js';
import { toCustomerDetailDto, toEmployeeDetailDto } from './user-operations.projector.js';

const now = new Date('2026-08-25T10:00:00.000Z');

describe('user operations safe projectors', () => {
  it('never projects employee password or credential fields', () => {
    const projected = toEmployeeDetailDto({
      id: '01991c68-8d3f-73a6-8f92-3c7381af4651',
      email: 'employee@rephone.local',
      normalizedEmail: 'employee@rephone.local',
      passwordHash: 'argon-secret',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      fullName: 'Employee',
      phone: '0900000000',
      employeeCode: 'EMP-002',
      hiredAt: now,
      emailVerifiedAt: now,
      passwordChangedAt: now,
      lastLoginAt: now,
      suspendedAt: null,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies User);

    expect(projected).toMatchObject({ employeeCode: 'EMP-002', status: 'ACTIVE' });
    expect(JSON.stringify(projected)).not.toMatch(/password|normalizedEmail|token|session/i);
  });

  it('projects only safe customer contact and order aggregates', () => {
    const projected = toCustomerDetailDto({
      id: '01991c68-8d3f-73a6-8f92-3c7381af4652',
      email: 'customer@rephone.local',
      normalizedEmail: 'customer@rephone.local',
      passwordHash: 'argon-secret',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Customer',
      phone: null,
      employeeCode: null,
      hiredAt: null,
      emailVerifiedAt: null,
      passwordChangedAt: now,
      lastLoginAt: now,
      suspendedAt: null,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
      _count: { orders: 2 },
      orders: [{ placedAt: now }],
    });

    expect(projected).toMatchObject({ orderCount: 2, lastOrderAt: now });
    expect(JSON.stringify(projected)).not.toMatch(
      /password|normalizedEmail|address|token|evidence/i,
    );
  });
});
