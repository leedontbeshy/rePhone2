import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import {
  EmployeeIdentityGateway,
  type PendingEmployeeInvitation,
} from '../auth/employee-identity.gateway.js';
import type {
  CreateEmployeeDto,
  CustomerListQueryDto,
  EmployeeListQueryDto,
  UpdateEmployeeDto,
} from './user-operations.dto.js';
import type {
  CustomerDetailDto,
  CustomerListItemDto,
  EmployeeCreateResultDto,
  EmployeeDetailDto,
  EmployeeListItemDto,
  InvitationDeliveryDto,
} from './user-operations-response.dto.js';
import { toCustomerDetailDto, toEmployeeDetailDto } from './user-operations.projector.js';
import { UserOperationsRepository } from './user-operations.repository.js';

@Injectable()
export class UserOperationsService {
  public constructor(
    @Inject(UserOperationsRepository)
    private readonly users: UserOperationsRepository,
    @Inject(EmployeeIdentityGateway)
    private readonly identity: EmployeeIdentityGateway,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
  ) {}

  public async listEmployees(
    query: EmployeeListQueryDto,
  ): Promise<PaginatedApiResult<EmployeeListItemDto>> {
    validateDateOnlyRange(query.hiredFrom, query.hiredTo);
    const { items, totalItems } = await this.users.listEmployees(query);
    return paginate(items.map(toEmployeeDetailDto), query.page, query.pageSize, totalItems);
  }

  public async getEmployee(id: string): Promise<EmployeeDetailDto> {
    const user = await this.users.findEmployee(id);
    if (user === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return toEmployeeDetailDto(user);
  }

  public async createEmployee(
    input: CreateEmployeeDto,
    actor: AuditActorContext,
  ): Promise<EmployeeCreateResultDto> {
    const now = new Date();
    let result: { employee: EmployeeDetailDto; invitation: PendingEmployeeInvitation };
    try {
      result = await this.transactions.run('employee.create', async (transaction) => {
        const employee = await this.users.createEmployee(
          {
            email: input.email,
            normalizedEmail: input.email.toLowerCase(),
            fullName: input.fullName,
            employeeCode: input.employeeCode,
            ...(input.phone === undefined ? {} : { phone: input.phone }),
            ...(input.hiredAt === undefined ? {} : { hiredAt: dateOnly(input.hiredAt) }),
          },
          transaction,
        );
        const invitation = await this.identity.issueInvitation(transaction, employee.id, now);
        await this.audit.write(transaction, actor, {
          action: 'employee.created',
          resourceType: 'User',
          resourceId: employee.id,
          changes: {
            after: {
              role: employee.role,
              status: employee.status,
              employeeCode: employee.employeeCode,
              phonePresent: employee.phone !== null,
              hiredAtPresent: employee.hiredAt !== null,
            },
          },
        });
        return { employee: toEmployeeDetailDto(employee), invitation };
      });
    } catch (error) {
      throw mapUniqueConflict(error);
    }

    const deliveryStatus = await this.identity.sendInvitation(
      result.employee.id,
      result.employee.email,
      result.invitation.rawToken,
    );
    return { employee: result.employee, deliveryStatus };
  }

  public async updateEmployee(
    id: string,
    input: UpdateEmployeeDto,
    actor: AuditActorContext,
  ): Promise<EmployeeDetailDto> {
    const changedFields = mutableEmployeeFields(input);
    if (changedFields.length === 0) throw new ApiError('VALIDATION_FAILED');

    try {
      return await this.transactions.run('employee.update', async (transaction) => {
        if (!(await this.users.lockUser(id, transaction))) {
          throw new ApiError('RESOURCE_NOT_FOUND');
        }
        const existing = await this.users.findEmployee(id, transaction);
        if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');

        const updated = await this.users.updateEmployee(
          id,
          {
            ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
            ...(input.phone === undefined ? {} : { phone: input.phone }),
            ...(input.employeeCode === undefined
              ? {}
              : { employeeCode: input.employeeCode.toUpperCase() }),
            ...(input.hiredAt === undefined
              ? {}
              : { hiredAt: input.hiredAt === null ? null : dateOnly(input.hiredAt) }),
          },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'employee.updated',
          resourceType: 'User',
          resourceId: id,
          changes: {
            fields: changedFields,
            before: {
              employeeCode: existing.employeeCode,
              hiredAt: existing.hiredAt?.toISOString().slice(0, 10) ?? null,
              phonePresent: existing.phone !== null,
            },
            after: {
              employeeCode: updated.employeeCode,
              hiredAt: updated.hiredAt?.toISOString().slice(0, 10) ?? null,
              phonePresent: updated.phone !== null,
            },
          },
        });
        return toEmployeeDetailDto(updated);
      });
    } catch (error) {
      throw mapUniqueConflict(error);
    }
  }

  public async resendInvitation(
    id: string,
    actor: AuditActorContext,
  ): Promise<InvitationDeliveryDto> {
    const now = new Date();
    const result = await this.transactions.run(
      'employee.invitation.resend',
      async (transaction) => {
        if (!(await this.users.lockUser(id, transaction))) {
          throw new ApiError('RESOURCE_NOT_FOUND');
        }
        const employee = await this.users.findEmployee(id, transaction);
        if (employee === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (employee.status !== 'PENDING_VERIFICATION' || employee.passwordHash !== null) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        const invitation = await this.identity.issueInvitation(transaction, id, now);
        await this.audit.write(transaction, actor, {
          action: 'employee.invitation_resent',
          resourceType: 'User',
          resourceId: id,
          metadata: { expiresAt: invitation.expiresAt.toISOString() },
        });
        return { employee, invitation };
      },
    );

    const deliveryStatus = await this.identity.sendInvitation(
      result.employee.id,
      result.employee.email,
      result.invitation.rawToken,
    );
    return { employeeId: result.employee.id, deliveryStatus };
  }

  public disableEmployee(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<EmployeeDetailDto> {
    return this.transactions.run('employee.disable', async (transaction) => {
      if (!(await this.users.lockUser(id, transaction))) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const employee = await this.users.findEmployee(id, transaction);
      if (employee === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (employee.status !== 'ACTIVE' && employee.status !== 'PENDING_VERIFICATION') {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const now = new Date();
      const updated = await this.users.updateEmployee(
        id,
        { status: 'DISABLED', disabledAt: now },
        transaction,
      );
      await this.identity.revokeAllCredentials(transaction, id, now);
      await this.audit.write(transaction, actor, {
        action: 'employee.disabled',
        resourceType: 'User',
        resourceId: id,
        changes: { before: { status: employee.status }, after: { status: updated.status } },
        metadata: { reason },
      });
      return toEmployeeDetailDto(updated);
    });
  }

  public async enableEmployee(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<EmployeeDetailDto> {
    const now = new Date();
    const result = await this.transactions.run('employee.enable', async (transaction) => {
      if (!(await this.users.lockUser(id, transaction))) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const employee = await this.users.findEmployee(id, transaction);
      if (employee === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (employee.status !== 'DISABLED') throw new ApiError('INVALID_STATE_TRANSITION');

      const nextStatus = employee.passwordHash === null ? 'PENDING_VERIFICATION' : 'ACTIVE';
      const updated = await this.users.updateEmployee(
        id,
        { status: nextStatus, disabledAt: null },
        transaction,
      );
      const invitation =
        employee.passwordHash === null
          ? await this.identity.issueInvitation(transaction, id, now)
          : undefined;
      await this.audit.write(transaction, actor, {
        action: 'employee.enabled',
        resourceType: 'User',
        resourceId: id,
        changes: { before: { status: employee.status }, after: { status: updated.status } },
        metadata: { reason, invitationIssued: invitation !== undefined },
      });
      return { employee: toEmployeeDetailDto(updated), invitation };
    });

    if (result.invitation !== undefined) {
      await this.identity.sendInvitation(
        result.employee.id,
        result.employee.email,
        result.invitation.rawToken,
      );
    }
    return result.employee;
  }

  public async listCustomers(
    query: CustomerListQueryDto,
  ): Promise<PaginatedApiResult<CustomerListItemDto>> {
    validateDateRange(query.createdFrom, query.createdTo);
    const { items, totalItems } = await this.users.listCustomers(query);
    return paginate(items.map(toCustomerDetailDto), query.page, query.pageSize, totalItems);
  }

  public async getCustomer(id: string): Promise<CustomerDetailDto> {
    const customer = await this.users.findCustomer(id);
    if (customer === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return toCustomerDetailDto(customer);
  }

  public suspendCustomer(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<CustomerDetailDto> {
    return this.transactions.run('customer.suspend', async (transaction) => {
      if (!(await this.users.lockUser(id, transaction))) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const customer = await this.users.findCustomer(id, transaction);
      if (customer === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (customer.status !== 'ACTIVE') throw new ApiError('INVALID_STATE_TRANSITION');

      const now = new Date();
      const updated = await this.users.updateCustomer(
        id,
        { status: 'SUSPENDED', suspendedAt: now },
        transaction,
      );
      await this.identity.revokeAllCredentials(transaction, id, now);
      await this.audit.write(transaction, actor, {
        action: 'customer.suspended',
        resourceType: 'User',
        resourceId: id,
        changes: { before: { status: customer.status }, after: { status: updated.status } },
        metadata: { reason },
      });
      return toCustomerDetailDto(updated);
    });
  }

  public activateCustomer(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<CustomerDetailDto> {
    return this.transactions.run('customer.activate', async (transaction) => {
      if (!(await this.users.lockUser(id, transaction))) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const customer = await this.users.findCustomer(id, transaction);
      if (customer === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (customer.status !== 'SUSPENDED' || customer.passwordHash === null) {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const updated = await this.users.updateCustomer(
        id,
        { status: 'ACTIVE', suspendedAt: null },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'customer.activated',
        resourceType: 'User',
        resourceId: id,
        changes: { before: { status: customer.status }, after: { status: updated.status } },
        metadata: { reason },
      });
      return toCustomerDetailDto(updated);
    });
  }
}

function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): PaginatedApiResult<T> {
  return new PaginatedApiResult(items, {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  });
}

function validateDateRange(from: string | undefined, to: string | undefined): void {
  if (from !== undefined && to !== undefined && new Date(from) > new Date(to)) {
    throw new ApiError('VALIDATION_FAILED');
  }
}

function validateDateOnlyRange(from: string | undefined, to: string | undefined): void {
  const fromDate = from === undefined ? undefined : dateOnly(from);
  const toDate = to === undefined ? undefined : dateOnly(to);
  if (fromDate !== undefined && toDate !== undefined && fromDate > toDate) {
    throw new ApiError('VALIDATION_FAILED');
  }
}

function dateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError('VALIDATION_FAILED');
  }
  return parsed;
}

function mutableEmployeeFields(input: UpdateEmployeeDto): string[] {
  return (['fullName', 'phone', 'employeeCode', 'hiredAt'] as const).filter(
    (field) => input[field] !== undefined,
  );
}

function mapUniqueConflict(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    return new ApiError('DUPLICATE_RESOURCE');
  }
  return error;
}
