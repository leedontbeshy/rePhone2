import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const afterSalesOrderItemSelect = {
  id: true,
  orderId: true,
  productId: true,
  variantId: true,
  inventoryUnitId: true,
  productTypeSnapshot: true,
  productNameSnapshot: true,
  variantNameSnapshot: true,
  inventoryCodeSnapshot: true,
  quantity: true,
  lineTotal: true,
  order: {
    select: {
      id: true,
      channel: true,
      orderNumber: true,
      customerId: true,
      guestAccessTokenHash: true,
      status: true,
      completedAt: true,
      sourceCart: {
        select: { status: true, guestTokenHash: true, expiresAt: true },
      },
    },
  },
  warranty: {
    select: {
      id: true,
      warrantyCode: true,
      inventoryUnitId: true,
      status: true,
      startAt: true,
      endAt: true,
    },
  },
} satisfies Prisma.OrderItemSelect;

type SelectedAfterSalesOrderItemContext = Prisma.OrderItemGetPayload<{
  select: typeof afterSalesOrderItemSelect;
}>;
export type AfterSalesOrderItemContext = Omit<SelectedAfterSalesOrderItemContext, 'order'> & {
  order: Omit<SelectedAfterSalesOrderItemContext['order'], 'channel'> & {
    channel?: 'STOREFRONT' | 'DEALER';
  };
};

@Injectable()
export class AfterSalesOrderGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findItemContext(orderItemId: string, client: DbClient = this.prisma) {
    return client.orderItem.findUnique({
      where: { id: orderItemId },
      select: afterSalesOrderItemSelect,
    });
  }

  public async lockCompletedItem(
    orderItemId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesOrderItemContext | null> {
    const root = await transaction.orderItem.findUnique({
      where: { id: orderItemId },
      select: { orderId: true },
    });
    if (root === null || !(await this.lockOrder(root.orderId, transaction))) return null;

    const itemRows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM order_items WHERE id = ${orderItemId}::uuid FOR UPDATE
    `;
    if (itemRows.length !== 1) return null;

    const item = await transaction.orderItem.findUnique({
      where: { id: orderItemId },
      select: afterSalesOrderItemSelect,
    });
    if (
      item === null ||
      item.orderId !== root.orderId ||
      item.order.status !== 'COMPLETED' ||
      item.order.completedAt === null
    ) {
      return null;
    }
    return item;
  }

  public async lockOrder(orderId: string, transaction: Prisma.TransactionClient): Promise<boolean> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `;
    return rows.length === 1;
  }
}
