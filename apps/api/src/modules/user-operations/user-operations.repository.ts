import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CustomerListQueryDto, EmployeeListQueryDto } from './user-operations.dto.js';
import type { CustomerWithOrderSummary } from './user-operations.projector.js';

const customerSummaryInclude = {
  _count: { select: { orders: true } },
  orders: { select: { placedAt: true }, orderBy: { placedAt: 'desc' }, take: 1 },
} as const satisfies Prisma.UserInclude;

@Injectable()
export class UserOperationsRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async listEmployees(
    query: EmployeeListQueryDto,
  ): Promise<{ items: User[]; totalItems: number }> {
    const where = employeeWhere(query);
    const [totalItems, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, totalItems };
  }

  public findEmployee(id: string, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    return client.user.findFirst({ where: { id, role: 'EMPLOYEE' } });
  }

  public createEmployee(
    data: {
      email: string;
      normalizedEmail: string;
      fullName: string;
      phone?: string;
      employeeCode: string;
      hiredAt?: Date;
    },
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.user.create({
      data: { ...data, role: 'EMPLOYEE', status: 'PENDING_VERIFICATION' },
    });
  }

  public updateEmployee(
    id: string,
    data: Prisma.UserUpdateInput,
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.user.update({ where: { id }, data });
  }

  public async listCustomers(
    query: CustomerListQueryDto,
  ): Promise<{ items: CustomerWithOrderSummary[]; totalItems: number }> {
    const where = customerWhere(query);
    const [totalItems, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: customerSummaryInclude,
        orderBy: [customerSort(query), { id: query.sortOrder }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, totalItems };
  }

  public findCustomer(
    id: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<CustomerWithOrderSummary | null> {
    return client.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      include: customerSummaryInclude,
    });
  }

  public updateCustomer(
    id: string,
    data: Prisma.UserUpdateInput,
    transaction: Prisma.TransactionClient,
  ): Promise<CustomerWithOrderSummary> {
    return transaction.user.update({
      where: { id },
      data,
      include: customerSummaryInclude,
    });
  }

  public async lockUser(id: string, transaction: Prisma.TransactionClient): Promise<boolean> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE
    `;
    return rows.length === 1;
  }
}

function customerSort(query: CustomerListQueryDto): Prisma.UserOrderByWithRelationInput {
  return query.sortBy === 'lastLoginAt'
    ? { lastLoginAt: { sort: query.sortOrder, nulls: 'last' } }
    : { createdAt: query.sortOrder };
}

function employeeWhere(query: EmployeeListQueryDto): Prisma.UserWhereInput {
  return {
    role: 'EMPLOYEE',
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.hiredFrom === undefined && query.hiredTo === undefined
      ? {}
      : {
          hiredAt: {
            ...(query.hiredFrom === undefined ? {} : { gte: dateOnly(query.hiredFrom) }),
            ...(query.hiredTo === undefined ? {} : { lte: dateOnly(query.hiredTo) }),
          },
        }),
    ...(query.q === undefined ? {} : { OR: userSearch(query.q, true) }),
  };
}

function customerWhere(query: CustomerListQueryDto): Prisma.UserWhereInput {
  return {
    role: 'CUSTOMER',
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.createdFrom === undefined && query.createdTo === undefined
      ? {}
      : {
          createdAt: {
            ...(query.createdFrom === undefined ? {} : { gte: new Date(query.createdFrom) }),
            ...(query.createdTo === undefined ? {} : { lte: new Date(query.createdTo) }),
          },
        }),
    ...(query.q === undefined ? {} : { OR: userSearch(query.q, false) }),
  };
}

function userSearch(query: string, includeEmployeeCode: boolean): Prisma.UserWhereInput[] {
  const normalized = query.trim();
  return [
    { normalizedEmail: { contains: normalized.toLowerCase() } },
    { fullName: { contains: normalized, mode: 'insensitive' } },
    { phone: { contains: normalized, mode: 'insensitive' } },
    ...(includeEmployeeCode
      ? [{ employeeCode: { contains: normalized.toUpperCase(), mode: 'insensitive' as const } }]
      : []),
  ];
}

function dateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid validated date-only value.');
  }
  return parsed;
}
