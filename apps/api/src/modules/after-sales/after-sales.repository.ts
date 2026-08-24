import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CustomerAfterSalesListQueryDto } from './after-sales.dto.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const afterSalesPublicSelect = {
  id: true,
  requestNumber: true,
  warrantyId: true,
  orderItemId: true,
  customerId: true,
  type: true,
  issueDescription: true,
  requestedResolution: true,
  status: true,
  attachments: true,
  decisionNote: true,
  resolutionType: true,
  resolutionNote: true,
  cancelReason: true,
  requestedAt: true,
  receivedAt: true,
  inspectedAt: true,
  decidedAt: true,
  resolvedAt: true,
  returnedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  warranty: {
    select: {
      id: true,
      warrantyCode: true,
      status: true,
      startAt: true,
      endAt: true,
    },
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
          customerEmail: true,
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

export type AfterSalesPublicRecord = Prisma.AfterSalesRequestGetPayload<{
  select: typeof afterSalesPublicSelect;
}>;
export type AfterSalesCreateData = Omit<
  Prisma.AfterSalesRequestUncheckedCreateInput,
  'requestedResolution'
> & { requestedResolution: string | null };

export const OPEN_AFTER_SALES_STATUSES = [
  'REQUESTED',
  'RECEIVED',
  'INSPECTING',
  'APPROVED',
] as const;

@Injectable()
export class AfterSalesRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findByRequestNumber(requestNumber: string, client: DbClient = this.prisma) {
    return client.afterSalesRequest.findUnique({
      where: { requestNumber },
      select: afterSalesPublicSelect,
    });
  }

  public findById(id: string, client: DbClient = this.prisma) {
    return client.afterSalesRequest.findUnique({ where: { id }, select: afterSalesPublicSelect });
  }

  public async listCustomer(customerId: string, query: CustomerAfterSalesListQueryDto) {
    const where = {
      customerId,
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.status === undefined ? {} : { status: query.status }),
    } satisfies Prisma.AfterSalesRequestWhereInput;
    const [items, totalItems] = await Promise.all([
      this.prisma.afterSalesRequest.findMany({
        where,
        select: afterSalesPublicSelect,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.afterSalesRequest.count({ where }),
    ]);
    return { items, totalItems };
  }

  public findOpenForOrderItem(orderItemId: string, transaction: Prisma.TransactionClient) {
    return transaction.afterSalesRequest.findFirst({
      where: { orderItemId, status: { in: [...OPEN_AFTER_SALES_STATUSES] } },
      select: { id: true, requestNumber: true },
    });
  }

  public create(data: AfterSalesCreateData, transaction: Prisma.TransactionClient) {
    return transaction.afterSalesRequest.create({
      data: data as Prisma.AfterSalesRequestUncheckedCreateInput,
      select: afterSalesPublicSelect,
    });
  }

  public async lockById(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesPublicRecord | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM after_sales_requests WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) return null;
    return this.findById(id, transaction);
  }

  public update(
    id: string,
    data: Prisma.AfterSalesRequestUncheckedUpdateInput,
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.afterSalesRequest.update({
      where: { id },
      data,
      select: afterSalesPublicSelect,
    });
  }
}
