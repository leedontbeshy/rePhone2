import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbClient = PrismaService | Prisma.TransactionClient;

export const settingsInclude = {
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.StoreSettingsInclude;

export type SettingsRecord = Prisma.StoreSettingsGetPayload<{ include: typeof settingsInclude }>;

@Injectable()
export class SettingsRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public find(client: DbClient = this.prisma): Promise<SettingsRecord | null> {
    return client.storeSettings.findUnique({ where: { key: 'STORE' }, include: settingsInclude });
  }

  public findPickupLocation(client: DbClient = this.prisma) {
    return client.inventoryLocation.findFirst({
      where: { type: 'STORE', status: 'ACTIVE' },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
  }

  public updateIfVersion(
    expectedVersion: number,
    actorUserId: string,
    data: Prisma.StoreSettingsUpdateManyMutationInput,
    client: DbClient,
  ) {
    return client.storeSettings.updateMany({
      where: { key: 'STORE', version: expectedVersion },
      data: { ...data, updatedById: actorUserId, version: { increment: 1 } },
    });
  }
}
