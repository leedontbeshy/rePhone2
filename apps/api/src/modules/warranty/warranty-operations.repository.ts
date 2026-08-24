import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  BackofficeWarrantyListQueryDto,
  WarrantyPaginationDto,
  WarrantyPolicyListQueryDto,
} from './warranty.dto.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const policySelect = {
  id: true,
  code: true,
  name: true,
  defaultDays: true,
  terms: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarrantyPolicySelect;

const warrantySelect = {
  id: true,
  warrantyCode: true,
  orderItemId: true,
  customerId: true,
  inventoryUnitId: true,
  policyId: true,
  daysSnapshot: true,
  termsSnapshot: true,
  startAt: true,
  endAt: true,
  status: true,
  voidReason: true,
  voidedById: true,
  voidedAt: true,
  createdAt: true,
  updatedAt: true,
  policy: { select: { id: true, code: true, name: true } },
  voidedBy: { select: { id: true, fullName: true } },
  inventoryUnit: {
    select: {
      inventoryCode: true,
      imei1Suffix: true,
      serialSuffix: true,
    },
  },
  orderItem: {
    select: {
      id: true,
      productNameSnapshot: true,
      variantNameSnapshot: true,
      skuSnapshot: true,
      inventoryCodeSnapshot: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
          guestAccessTokenHash: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          sourceCart: {
            select: {
              status: true,
              guestTokenHash: true,
              expiresAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WarrantySelect;

export type WarrantyPolicyRecord = Prisma.WarrantyPolicyGetPayload<{
  select: typeof policySelect;
}>;
export type WarrantyOperationsRecord = Prisma.WarrantyGetPayload<{
  select: typeof warrantySelect;
}>;

@Injectable()
export class WarrantyOperationsRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async listPolicies(query: WarrantyPolicyListQueryDto) {
    const where: Prisma.WarrantyPolicyWhereInput = {
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.archived === undefined
        ? {}
        : { archivedAt: query.archived ? { not: null } : null }),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.warrantyPolicy.findMany({
        where,
        select: policySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.warrantyPolicy.count({ where }),
    ]);
    return { items, totalItems };
  }

  public async listCustomer(customerId: string, query: WarrantyPaginationDto) {
    const where = { customerId } satisfies Prisma.WarrantyWhereInput;
    const [items, totalItems] = await Promise.all([
      this.prisma.warranty.findMany({
        where,
        select: warrantySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.warranty.count({ where }),
    ]);
    return { items, totalItems };
  }

  public findByCode(warrantyCode: string, client: DbClient = this.prisma) {
    return client.warranty.findUnique({ where: { warrantyCode }, select: warrantySelect });
  }

  public async listBackoffice(query: BackofficeWarrantyListQueryDto, now: Date) {
    const where: Prisma.WarrantyWhereInput = {
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { warrantyCode: { contains: query.q, mode: 'insensitive' as const } },
              {
                orderItem: {
                  is: {
                    OR: [
                      { productNameSnapshot: { contains: query.q, mode: 'insensitive' as const } },
                      { variantNameSnapshot: { contains: query.q, mode: 'insensitive' as const } },
                      {
                        order: {
                          is: {
                            OR: [
                              { orderNumber: { contains: query.q, mode: 'insensitive' as const } },
                              { customerName: { contains: query.q, mode: 'insensitive' as const } },
                              {
                                customerEmail: { contains: query.q, mode: 'insensitive' as const },
                              },
                              {
                                customerPhone: { contains: query.q, mode: 'insensitive' as const },
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.customerId === undefined ? {} : { customerId: query.customerId }),
      ...validityWhere(query.validity, now),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.warranty.findMany({
        where,
        select: warrantySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.warranty.count({ where }),
    ]);
    return { items, totalItems };
  }

  public findById(id: string, client: DbClient = this.prisma) {
    return client.warranty.findUnique({ where: { id }, select: warrantySelect });
  }

  public createPolicy(
    data: Prisma.WarrantyPolicyUncheckedCreateInput,
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.warrantyPolicy.create({ data, select: policySelect });
  }

  public updatePolicy(
    id: string,
    data: Prisma.WarrantyPolicyUncheckedUpdateInput,
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.warrantyPolicy.update({ where: { id }, data, select: policySelect });
  }
}

function validityWhere(
  validity: BackofficeWarrantyListQueryDto['validity'],
  now: Date,
): Prisma.WarrantyWhereInput {
  switch (validity) {
    case 'VALID':
      return { status: 'ACTIVE', startAt: { lte: now }, endAt: { gt: now } };
    case 'EXPIRED':
      return { endAt: { lte: now } };
    case 'NOT_STARTED':
      return { startAt: { gt: now } };
    case undefined:
      return {};
  }
}
