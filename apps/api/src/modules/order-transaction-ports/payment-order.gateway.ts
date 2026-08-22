import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

const orderOwnershipSelect = {
  id: true,
  customerId: true,
  guestAccessTokenHash: true,
  sourceCart: {
    select: { status: true, guestTokenHash: true, expiresAt: true },
  },
} satisfies Prisma.OrderSelect;

export type PaymentOrderOwnershipRecord = Prisma.OrderGetPayload<{
  select: typeof orderOwnershipSelect;
}>;

@Injectable()
export class PaymentOrderGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findOwnership(
    orderId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PaymentOrderOwnershipRecord | null> {
    return client.order.findUnique({ where: { id: orderId }, select: orderOwnershipSelect });
  }

  public lock(orderId: string, transaction: Prisma.TransactionClient): Promise<unknown> {
    return transaction.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  }
}
