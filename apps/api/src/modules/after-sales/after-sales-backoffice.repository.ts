import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { BackofficeAfterSalesListQueryDto } from './after-sales.dto.js';

export const afterSalesBackofficeSelect = {
  id: true,
  requestNumber: true,
  warrantyId: true,
  orderItemId: true,
  customerId: true,
  type: true,
  issueDescription: true,
  requestedResolution: true,
  status: true,
  assignedToId: true,
  receivedLocationId: true,
  receivedById: true,
  receiveNote: true,
  attachments: true,
  inspectionSummary: true,
  inventoryInspectionId: true,
  decisionNote: true,
  decidedById: true,
  decidedAt: true,
  resolutionType: true,
  resolutionNote: true,
  replacementInventoryUnitId: true,
  refundId: true,
  resolvedById: true,
  returnNote: true,
  cancelReason: true,
  requestedAt: true,
  receivedAt: true,
  inspectedAt: true,
  resolvedAt: true,
  returnedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, fullName: true, status: true } },
  receivedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  resolvedBy: { select: { id: true, fullName: true } },
  receivedLocation: {
    select: { id: true, code: true, name: true, type: true, status: true },
  },
  warranty: {
    select: {
      id: true,
      warrantyCode: true,
      status: true,
      startAt: true,
      endAt: true,
    },
  },
  inventoryInspection: {
    select: {
      id: true,
      inspectionType: true,
      status: true,
      overallResult: true,
      inspectedAt: true,
      inspector: { select: { id: true, fullName: true } },
    },
  },
  refund: {
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      completedAt: true,
    },
  },
  replacementInventoryUnit: {
    select: { id: true, inventoryCode: true, lifecycleStatus: true },
  },
  orderItem: {
    select: {
      id: true,
      productId: true,
      variantId: true,
      inventoryUnitId: true,
      productTypeSnapshot: true,
      productNameSnapshot: true,
      variantNameSnapshot: true,
      inventoryCodeSnapshot: true,
      quantity: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
          guestAccessTokenHash: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          status: true,
          completedAt: true,
          sourceCart: {
            select: { status: true, guestTokenHash: true, expiresAt: true },
          },
        },
      },
    },
  },
} satisfies Prisma.AfterSalesRequestSelect;

export type AfterSalesBackofficeRecord = Prisma.AfterSalesRequestGetPayload<{
  select: typeof afterSalesBackofficeSelect;
}>;

@Injectable()
export class AfterSalesBackofficeRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async list(query: BackofficeAfterSalesListQueryDto) {
    const where = buildWhere(query);
    const order = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.AfterSalesRequestOrderByWithRelationInput;
    const [items, totalItems] = await Promise.all([
      this.prisma.afterSalesRequest.findMany({
        where,
        select: afterSalesBackofficeSelect,
        orderBy: [order, { id: query.sortOrder }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.afterSalesRequest.count({ where }),
    ]);
    return { items, totalItems };
  }

  public findById(id: string) {
    return this.prisma.afterSalesRequest.findUnique({
      where: { id },
      select: afterSalesBackofficeSelect,
    });
  }
}

function buildWhere(query: BackofficeAfterSalesListQueryDto): Prisma.AfterSalesRequestWhereInput {
  const q = query.q?.trim();
  return {
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.assignedToId === undefined ? {} : { assignedToId: query.assignedToId }),
    ...(query.createdFrom === undefined && query.createdTo === undefined
      ? {}
      : {
          createdAt: {
            ...(query.createdFrom === undefined ? {} : { gte: new Date(query.createdFrom) }),
            ...(query.createdTo === undefined ? {} : { lte: new Date(query.createdTo) }),
          },
        }),
    ...(q === undefined
      ? {}
      : {
          OR: [
            { requestNumber: { contains: q, mode: 'insensitive' as const } },
            { warranty: { is: { warrantyCode: { contains: q, mode: 'insensitive' as const } } } },
            {
              orderItem: {
                is: {
                  order: {
                    is: {
                      OR: [
                        { orderNumber: { contains: q, mode: 'insensitive' as const } },
                        { customerName: { contains: q, mode: 'insensitive' as const } },
                        { customerEmail: { contains: q, mode: 'insensitive' as const } },
                        { customerPhone: { contains: q, mode: 'insensitive' as const } },
                      ],
                    },
                  },
                },
              },
            },
          ],
        }),
  };
}
