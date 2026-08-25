import type { Prisma, User } from '../../generated/prisma/client.js';
import type { CustomerDetailDto, EmployeeDetailDto } from './user-operations-response.dto.js';

export type CustomerWithOrderSummary = Prisma.UserGetPayload<{
  include: {
    _count: { select: { orders: true } };
    orders: { select: { placedAt: true }; orderBy: { placedAt: 'desc' }; take: 1 };
  };
}>;

export function toEmployeeDetailDto(user: User): EmployeeDetailDto {
  if (user.role !== 'EMPLOYEE' || user.employeeCode === null) {
    throw new Error('Employee projection requires an EMPLOYEE with an employee code.');
  }
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    fullName: user.fullName,
    phone: user.phone,
    employeeCode: user.employeeCode,
    hiredAt: user.hiredAt?.toISOString().slice(0, 10) ?? null,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    disabledAt: user.disabledAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toCustomerDetailDto(user: CustomerWithOrderSummary): CustomerDetailDto {
  if (user.role !== 'CUSTOMER') {
    throw new Error('Customer projection requires a CUSTOMER user.');
  }
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    fullName: user.fullName,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    suspendedAt: user.suspendedAt,
    orderCount: user._count.orders,
    lastOrderAt: user.orders[0]?.placedAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
