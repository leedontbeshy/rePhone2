import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class WishlistRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public list(customerId: string, client: DbClient = this.prisma) {
    return client.wishlistItem.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  public lockCustomer(customerId: string, client: Prisma.TransactionClient): Promise<unknown> {
    return client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wishlist:${customerId}`}, 0))`;
  }
}
