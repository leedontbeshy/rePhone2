import type { User } from '../../generated/prisma/client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type {
  EmployeeIdentityGateway,
  PendingEmployeeInvitation,
} from '../auth/employee-identity.gateway.js';
import type { CustomerWithOrderSummary } from './user-operations.projector.js';
import type { UserOperationsRepository } from './user-operations.repository.js';
import { UserOperationsService } from './user-operations.service.js';

const NOW = new Date('2026-08-25T10:00:00.000Z');
const DATE_ONLY = new Date('2026-08-25T00:00:00.000Z');
const ACTOR: AuditActorContext = {
  actorUserId: '01991c68-8d3f-73a6-8f92-3c7381af4600',
  requestId: '01991c68-8d3f-73a6-8f92-3c7381af4601',
  ipAddress: '127.0.0.1',
};
const INVITATION: PendingEmployeeInvitation = {
  rawToken: 'secret-token',
  expiresAt: new Date('2026-08-26T10:00:00.000Z'),
};

describe('UserOperationsService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('employee queries and creation', () => {
    it('validates the hire range and returns stable pagination', async () => {
      const fixture = createFixture();
      fixture.users.listEmployees.mockResolvedValue({
        items: [employee()],
        totalItems: 21,
      });

      const result = await fixture.service.listEmployees({
        page: 2,
        pageSize: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        hiredFrom: '2026-01-01',
        hiredTo: '2026-08-25',
      });

      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 10,
        totalItems: 21,
        totalPages: 3,
      });
      expect(result.items).toEqual([expect.objectContaining({ employeeCode: 'EMP-001' })]);
    });

    it('returns zero pages for an empty result', async () => {
      const fixture = createFixture();
      fixture.users.listEmployees.mockResolvedValue({ items: [], totalItems: 0 });

      const result = await fixture.service.listEmployees(employeeQuery());

      expect(result.pagination.totalPages).toBe(0);
    });

    it.each([
      ['2026-08-26', '2026-08-25'],
      ['2026-02-30', '2026-08-25'],
    ])('rejects an invalid hire range %s..%s', async (hiredFrom, hiredTo) => {
      const fixture = createFixture();

      await expect(
        fixture.service.listEmployees({ ...employeeQuery(), hiredFrom, hiredTo }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(fixture.users.listEmployees).not.toHaveBeenCalled();
    });

    it('returns an employee and hides a missing employee behind 404', async () => {
      const fixture = createFixture();
      fixture.users.findEmployee.mockResolvedValueOnce(employee()).mockResolvedValueOnce(null);

      await expect(fixture.service.getEmployee(employee().id)).resolves.toMatchObject({
        id: employee().id,
      });
      await expect(fixture.service.getEmployee('missing')).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('creates the employee and invitation atomically, then sends after commit', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const fixture = createFixture();
      fixture.users.createEmployee.mockResolvedValue(employee({ hiredAt: null, phone: null }));
      fixture.identity.issueInvitation.mockResolvedValue(INVITATION);

      const result = await fixture.service.createEmployee(
        {
          email: 'Employee@Example.com',
          fullName: 'Employee',
          employeeCode: 'EMP-001',
        },
        ACTOR,
      );

      expect(fixture.users.createEmployee).toHaveBeenCalledWith(
        {
          email: 'Employee@Example.com',
          normalizedEmail: 'employee@example.com',
          fullName: 'Employee',
          employeeCode: 'EMP-001',
        },
        fixture.transaction,
      );
      expect(fixture.identity.issueInvitation).toHaveBeenCalledWith(
        fixture.transaction,
        employee().id,
        NOW,
      );
      expect(fixture.audit.write).toHaveBeenCalledWith(
        fixture.transaction,
        ACTOR,
        expect.objectContaining({ action: 'employee.created' }),
      );
      expect(fixture.identity.sendInvitation).toHaveBeenCalledWith(
        employee().id,
        employee().email,
        INVITATION.rawToken,
        INVITATION.expiresAt,
      );
      expect(result).toMatchObject({ deliveryStatus: 'SENT' });
      expect(fixture.sequence.indexOf('transaction:end')).toBeLessThan(
        fixture.sequence.indexOf('invitation:send'),
      );
    });

    it('normalizes optional hire data and preserves a failed mail delivery result', async () => {
      const fixture = createFixture();
      fixture.users.createEmployee.mockResolvedValue(employee());
      fixture.identity.issueInvitation.mockResolvedValue(INVITATION);
      fixture.identity.sendInvitation.mockImplementation(() => {
        fixture.sequence.push('invitation:send');
        return Promise.resolve('FAILED');
      });

      await expect(
        fixture.service.createEmployee(
          {
            email: 'employee@example.com',
            fullName: 'Employee',
            employeeCode: 'EMP-001',
            phone: '0900000000',
            hiredAt: '2026-08-25',
          },
          ACTOR,
        ),
      ).resolves.toMatchObject({ deliveryStatus: 'FAILED' });
      expect(fixture.users.createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '0900000000', hiredAt: DATE_ONLY }),
        fixture.transaction,
      );
    });

    it('maps only Prisma unique conflicts to DUPLICATE_RESOURCE', async () => {
      const unique = createFixture();
      unique.users.createEmployee.mockRejectedValue({ code: 'P2002' });
      await expect(
        unique.service.createEmployee(
          {
            email: 'employee@example.com',
            fullName: 'Employee',
            employeeCode: 'EMP-001',
          },
          ACTOR,
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });

      const generic = createFixture();
      const failure = new Error('database unavailable');
      generic.users.createEmployee.mockRejectedValue(failure);
      await expect(
        generic.service.createEmployee(
          {
            email: 'employee@example.com',
            fullName: 'Employee',
            employeeCode: 'EMP-001',
          },
          ACTOR,
        ),
      ).rejects.toBe(failure);
    });
  });

  describe('employee mutation lifecycle', () => {
    it('rejects an empty update before opening a transaction', async () => {
      const fixture = createFixture();

      await expect(fixture.service.updateEmployee(employee().id, {}, ACTOR)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(fixture.transactions.run).not.toHaveBeenCalled();
    });

    it('updates all mutable fields and audits only the safe delta', async () => {
      const fixture = createFixture();
      const existing = employee();
      const updated = employee({
        fullName: 'Updated',
        phone: null,
        employeeCode: 'EMP-UPDATED',
        hiredAt: null,
      });
      fixture.users.lockUser.mockResolvedValue(true);
      fixture.users.findEmployee.mockResolvedValue(existing);
      fixture.users.updateEmployee.mockResolvedValue(updated);

      await expect(
        fixture.service.updateEmployee(
          existing.id,
          {
            fullName: 'Updated',
            phone: null,
            employeeCode: 'emp-updated',
            hiredAt: null,
          },
          ACTOR,
        ),
      ).resolves.toMatchObject({ employeeCode: 'EMP-UPDATED', hiredAt: null });
      expect(fixture.users.updateEmployee).toHaveBeenCalledWith(
        existing.id,
        {
          fullName: 'Updated',
          phone: null,
          employeeCode: 'EMP-UPDATED',
          hiredAt: null,
        },
        fixture.transaction,
      );
      expect(fixture.audit.write).toHaveBeenCalledWith(
        fixture.transaction,
        ACTOR,
        expect.objectContaining({
          action: 'employee.updated',
          changes: {
            fields: ['fullName', 'phone', 'employeeCode', 'hiredAt'],
            before: {
              employeeCode: 'EMP-001',
              hiredAt: '2026-08-25',
              phonePresent: true,
            },
            after: {
              employeeCode: 'EMP-UPDATED',
              hiredAt: null,
              phonePresent: false,
            },
          },
        }),
      );
    });

    it('converts a date-only hire update and maps a unique conflict', async () => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(true);
      fixture.users.findEmployee.mockResolvedValue(employee());
      fixture.users.updateEmployee.mockRejectedValue({ code: 'P2002' });

      await expect(
        fixture.service.updateEmployee(employee().id, { hiredAt: '2026-08-25' }, ACTOR),
      ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });
      expect(fixture.users.updateEmployee).toHaveBeenCalledWith(
        employee().id,
        { hiredAt: DATE_ONLY },
        fixture.transaction,
      );
    });

    it.each([
      ['lock missing', false, employee()],
      ['employee missing after lock', true, null],
    ])('hides an update target when %s', async (_case, locked, found) => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(locked);
      fixture.users.findEmployee.mockResolvedValue(found);

      await expect(
        fixture.service.updateEmployee(employee().id, { fullName: 'Updated' }, ACTOR),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });

    it('resends a fresh invitation only for passwordless pending employees', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const fixture = createFixture();
      const pending = employee({ status: 'PENDING_VERIFICATION', passwordHash: null });
      fixture.users.lockUser.mockResolvedValue(true);
      fixture.users.findEmployee.mockResolvedValue(pending);
      fixture.identity.issueInvitation.mockResolvedValue(INVITATION);

      await expect(fixture.service.resendInvitation(pending.id, ACTOR)).resolves.toEqual({
        employeeId: pending.id,
        deliveryStatus: 'SENT',
      });
      expect(fixture.audit.write).toHaveBeenCalledWith(
        fixture.transaction,
        ACTOR,
        expect.objectContaining({
          action: 'employee.invitation_resent',
          metadata: { expiresAt: INVITATION.expiresAt.toISOString() },
        }),
      );
      expect(fixture.sequence.indexOf('transaction:end')).toBeLessThan(
        fixture.sequence.indexOf('invitation:send'),
      );
    });

    it.each([
      [
        false,
        employee({ status: 'PENDING_VERIFICATION', passwordHash: null }),
        'RESOURCE_NOT_FOUND',
      ],
      [true, null, 'RESOURCE_NOT_FOUND'],
      [true, employee({ status: 'ACTIVE' }), 'INVALID_STATE_TRANSITION'],
      [
        true,
        employee({ status: 'PENDING_VERIFICATION', passwordHash: 'configured' }),
        'INVALID_STATE_TRANSITION',
      ],
    ])('rejects invalid invitation resend state %#', async (locked, found, code) => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(locked);
      fixture.users.findEmployee.mockResolvedValue(found);

      await expect(fixture.service.resendInvitation(employee().id, ACTOR)).rejects.toMatchObject({
        code,
      });
      expect(fixture.identity.sendInvitation).not.toHaveBeenCalled();
    });

    it.each(['ACTIVE', 'PENDING_VERIFICATION'] as const)(
      'disables a %s employee and revokes credentials atomically',
      async (status) => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        const fixture = createFixture();
        const existing = employee({ status });
        const updated = employee({ status: 'DISABLED', disabledAt: NOW });
        fixture.users.lockUser.mockResolvedValue(true);
        fixture.users.findEmployee.mockResolvedValue(existing);
        fixture.users.updateEmployee.mockResolvedValue(updated);

        await expect(
          fixture.service.disableEmployee(existing.id, 'Lý do hợp lệ', ACTOR),
        ).resolves.toMatchObject({ status: 'DISABLED', disabledAt: NOW });
        expect(fixture.identity.revokeAllCredentials).toHaveBeenCalledWith(
          fixture.transaction,
          existing.id,
          NOW,
        );
        expect(fixture.audit.write).toHaveBeenCalledWith(
          fixture.transaction,
          ACTOR,
          expect.objectContaining({
            action: 'employee.disabled',
            metadata: { reason: 'Lý do hợp lệ' },
          }),
        );
      },
    );

    it.each([
      [false, employee(), 'RESOURCE_NOT_FOUND'],
      [true, null, 'RESOURCE_NOT_FOUND'],
      [true, employee({ status: 'DISABLED' }), 'INVALID_STATE_TRANSITION'],
    ])('rejects invalid employee disable state %#', async (locked, found, code) => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(locked);
      fixture.users.findEmployee.mockResolvedValue(found);

      await expect(
        fixture.service.disableEmployee(employee().id, 'Lý do hợp lệ', ACTOR),
      ).rejects.toMatchObject({ code });
      expect(fixture.identity.revokeAllCredentials).not.toHaveBeenCalled();
    });

    it('enables a configured employee without issuing an invitation', async () => {
      const fixture = createFixture();
      const disabled = employee({ status: 'DISABLED', disabledAt: NOW });
      fixture.users.lockUser.mockResolvedValue(true);
      fixture.users.findEmployee.mockResolvedValue(disabled);
      fixture.users.updateEmployee.mockResolvedValue(
        employee({ status: 'ACTIVE', disabledAt: null }),
      );

      await expect(
        fixture.service.enableEmployee(disabled.id, 'Khôi phục truy cập', ACTOR),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
      expect(fixture.identity.issueInvitation).not.toHaveBeenCalled();
      expect(fixture.identity.sendInvitation).not.toHaveBeenCalled();
    });

    it('enables a passwordless employee as pending and sends a new invitation after commit', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const fixture = createFixture();
      const disabled = employee({ status: 'DISABLED', passwordHash: null, disabledAt: NOW });
      fixture.users.lockUser.mockResolvedValue(true);
      fixture.users.findEmployee.mockResolvedValue(disabled);
      fixture.users.updateEmployee.mockResolvedValue(
        employee({ status: 'PENDING_VERIFICATION', passwordHash: null, disabledAt: null }),
      );
      fixture.identity.issueInvitation.mockResolvedValue(INVITATION);
      fixture.identity.sendInvitation.mockImplementation(() => {
        fixture.sequence.push('invitation:send');
        return Promise.resolve('FAILED');
      });

      await expect(
        fixture.service.enableEmployee(disabled.id, 'Khôi phục truy cập', ACTOR),
      ).resolves.toMatchObject({ status: 'PENDING_VERIFICATION' });
      expect(fixture.identity.issueInvitation).toHaveBeenCalledWith(
        fixture.transaction,
        disabled.id,
        NOW,
      );
      expect(fixture.identity.sendInvitation).toHaveBeenCalledOnce();
      expect(fixture.sequence.indexOf('transaction:end')).toBeLessThan(
        fixture.sequence.indexOf('invitation:send'),
      );
    });

    it.each([
      [false, employee({ status: 'DISABLED' }), 'RESOURCE_NOT_FOUND'],
      [true, null, 'RESOURCE_NOT_FOUND'],
      [true, employee({ status: 'ACTIVE' }), 'INVALID_STATE_TRANSITION'],
    ])('rejects invalid employee enable state %#', async (locked, found, code) => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(locked);
      fixture.users.findEmployee.mockResolvedValue(found);

      await expect(
        fixture.service.enableEmployee(employee().id, 'Khôi phục truy cập', ACTOR),
      ).rejects.toMatchObject({ code });
    });
  });

  describe('customer queries and lifecycle', () => {
    it('validates the created range and paginates customer summaries', async () => {
      const fixture = createFixture();
      fixture.users.listCustomers.mockResolvedValue({ items: [customer()], totalItems: 2 });

      const result = await fixture.service.listCustomers({
        ...customerQuery(),
        createdFrom: '2026-08-01T00:00:00.000Z',
        createdTo: '2026-08-25T00:00:00.000Z',
      });

      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
      });
      expect(result.items[0]).toMatchObject({ orderCount: 2, lastOrderAt: NOW });
    });

    it('rejects a reversed customer creation range', async () => {
      const fixture = createFixture();

      await expect(
        fixture.service.listCustomers({
          ...customerQuery(),
          createdFrom: '2026-08-26T00:00:00.000Z',
          createdTo: '2026-08-25T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(fixture.users.listCustomers).not.toHaveBeenCalled();
    });

    it('returns a customer and hides a missing customer behind 404', async () => {
      const fixture = createFixture();
      fixture.users.findCustomer.mockResolvedValueOnce(customer()).mockResolvedValueOnce(null);

      await expect(fixture.service.getCustomer(customer().id)).resolves.toMatchObject({
        id: customer().id,
      });
      await expect(fixture.service.getCustomer('missing')).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('suspends an active customer and revokes credentials atomically', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(true);
      fixture.users.findCustomer.mockResolvedValue(customer());
      fixture.users.updateCustomer.mockResolvedValue(
        customer({ status: 'SUSPENDED', suspendedAt: NOW }),
      );

      await expect(
        fixture.service.suspendCustomer(customer().id, 'Rủi ro tài khoản', ACTOR),
      ).resolves.toMatchObject({ status: 'SUSPENDED', suspendedAt: NOW });
      expect(fixture.identity.revokeAllCredentials).toHaveBeenCalledWith(
        fixture.transaction,
        customer().id,
        NOW,
      );
      expect(fixture.audit.write).toHaveBeenCalledWith(
        fixture.transaction,
        ACTOR,
        expect.objectContaining({ action: 'customer.suspended' }),
      );
    });

    it.each([
      [false, customer(), 'RESOURCE_NOT_FOUND'],
      [true, null, 'RESOURCE_NOT_FOUND'],
      [true, customer({ status: 'SUSPENDED' }), 'INVALID_STATE_TRANSITION'],
    ])('rejects invalid customer suspension state %#', async (locked, found, code) => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(locked);
      fixture.users.findCustomer.mockResolvedValue(found);

      await expect(
        fixture.service.suspendCustomer(customer().id, 'Rủi ro tài khoản', ACTOR),
      ).rejects.toMatchObject({ code });
      expect(fixture.identity.revokeAllCredentials).not.toHaveBeenCalled();
    });

    it('activates a suspended customer with a configured password', async () => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(true);
      fixture.users.findCustomer.mockResolvedValue(customer({ status: 'SUSPENDED' }));
      fixture.users.updateCustomer.mockResolvedValue(customer({ status: 'ACTIVE' }));

      await expect(
        fixture.service.activateCustomer(customer().id, 'Khôi phục tài khoản', ACTOR),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
      expect(fixture.users.updateCustomer).toHaveBeenCalledWith(
        customer().id,
        { status: 'ACTIVE', suspendedAt: null },
        fixture.transaction,
      );
      expect(fixture.audit.write).toHaveBeenCalledWith(
        fixture.transaction,
        ACTOR,
        expect.objectContaining({ action: 'customer.activated' }),
      );
    });

    it.each([
      [false, customer({ status: 'SUSPENDED' }), 'RESOURCE_NOT_FOUND'],
      [true, null, 'RESOURCE_NOT_FOUND'],
      [true, customer({ status: 'ACTIVE' }), 'INVALID_STATE_TRANSITION'],
      [true, customer({ status: 'SUSPENDED', passwordHash: null }), 'INVALID_STATE_TRANSITION'],
    ])('rejects invalid customer activation state %#', async (locked, found, code) => {
      const fixture = createFixture();
      fixture.users.lockUser.mockResolvedValue(locked);
      fixture.users.findCustomer.mockResolvedValue(found);

      await expect(
        fixture.service.activateCustomer(customer().id, 'Khôi phục tài khoản', ACTOR),
      ).rejects.toMatchObject({ code });
    });
  });
});

function createFixture() {
  const transaction = {};
  const sequence: string[] = [];
  const users = {
    listEmployees: vi.fn(),
    findEmployee: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    listCustomers: vi.fn(),
    findCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    lockUser: vi.fn(),
  };
  const identity = {
    issueInvitation: vi.fn(),
    revokeAllCredentials: vi.fn(),
    sendInvitation: vi.fn((): Promise<'SENT' | 'FAILED'> => {
      sequence.push('invitation:send');
      return Promise.resolve('SENT');
    }),
  };
  const audit = { write: vi.fn() };
  const transactions = {
    run: vi.fn(async (_operation: string, work: (client: object) => Promise<unknown>) => {
      sequence.push('transaction:start');
      const result = await work(transaction);
      sequence.push('transaction:end');
      return result;
    }),
  };

  return {
    transaction,
    sequence,
    users,
    identity,
    audit,
    transactions,
    service: new UserOperationsService(
      users as unknown as UserOperationsRepository,
      identity as unknown as EmployeeIdentityGateway,
      audit,
      transactions as unknown as SerializableTransactionRunner,
    ),
  };
}

function employeeQuery() {
  return {
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };
}

function customerQuery() {
  return {
    page: 1,
    pageSize: 20,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };
}

function employee(overrides: Partial<User> = {}): User {
  return {
    id: '01991c68-8d3f-73a6-8f92-3c7381af4651',
    email: 'employee@example.com',
    normalizedEmail: 'employee@example.com',
    passwordHash: 'argon-hash',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    fullName: 'Employee',
    phone: '0900000000',
    employeeCode: 'EMP-001',
    hiredAt: NOW,
    emailVerifiedAt: NOW,
    passwordChangedAt: NOW,
    lastLoginAt: NOW,
    suspendedAt: null,
    disabledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function customer(overrides: Partial<User> = {}): CustomerWithOrderSummary {
  return {
    id: '01991c68-8d3f-73a6-8f92-3c7381af4652',
    email: 'customer@example.com',
    normalizedEmail: 'customer@example.com',
    passwordHash: 'argon-hash',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    fullName: 'Customer',
    phone: '0910000000',
    employeeCode: null,
    hiredAt: null,
    emailVerifiedAt: NOW,
    passwordChangedAt: NOW,
    lastLoginAt: NOW,
    suspendedAt: null,
    disabledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    _count: { orders: 2 },
    orders: [{ placedAt: NOW }],
    ...overrides,
  };
}
