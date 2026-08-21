import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const cartWithItems = {
  items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.CartInclude;

export type CartRecord = Prisma.CartGetPayload<{ include: typeof cartWithItems }>;

@Injectable()
export class CartRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findActiveForCustomer(customerId: string, client: DbClient = this.prisma) {
    return client.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
      include: cartWithItems,
    });
  }

  public findActiveForGuest(guestTokenHash: string, client: DbClient = this.prisma) {
    return client.cart.findFirst({
      where: { guestTokenHash, status: 'ACTIVE' },
      include: cartWithItems,
    });
  }

  public findActiveById(id: string, client: DbClient = this.prisma) {
    return client.cart.findFirst({ where: { id, status: 'ACTIVE' }, include: cartWithItems });
  }

  public createCustomer(customerId: string, client: DbClient) {
    return client.cart.create({ data: { customerId }, include: cartWithItems });
  }

  public createGuest(guestTokenHash: string, expiresAt: Date, client: DbClient) {
    return client.cart.create({ data: { guestTokenHash, expiresAt }, include: cartWithItems });
  }

  public lockIdentity(identityKey: string, client: Prisma.TransactionClient): Promise<unknown> {
    return client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identityKey}, 0))`;
  }

  public lockCart(cartId: string, client: Prisma.TransactionClient): Promise<unknown> {
    return client.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
  }
}
