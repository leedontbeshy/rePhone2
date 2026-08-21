import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class MediaRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public find(id: string, client: DbClient = this.prisma) {
    return client.productMedia.findUnique({ where: { id } });
  }

  public create(data: Prisma.ProductMediaUncheckedCreateInput, client: DbClient) {
    return client.productMedia.create({ data });
  }

  public update(id: string, data: Prisma.ProductMediaUpdateInput, client: DbClient) {
    return client.productMedia.update({ where: { id }, data });
  }

  public delete(id: string, client: DbClient) {
    return client.productMedia.delete({ where: { id } });
  }
}
