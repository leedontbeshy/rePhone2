import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { IdentifierType } from './identifier-protection.js';
import type { InventoryUnitListQueryDto } from './inventory.dto.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const unitListInclude = {
  variant: { include: { product: true } },
  location: true,
  inspections: {
    where: { isCurrent: true, status: 'COMPLETED' as const },
    orderBy: [{ inspectedAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
  },
  _count: {
    select: {
      media: true,
      reservations: { where: { status: 'ACTIVE' as const } },
      inspections: { where: { status: 'DRAFT' as const } },
    },
  },
} satisfies Prisma.InventoryUnitInclude;

const unitDetailInclude = {
  ...unitListInclude,
  media: {
    where: { visibility: 'PUBLIC' as const },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.InventoryUnitInclude;

export type InventoryUnitListRecord = Prisma.InventoryUnitGetPayload<{
  include: typeof unitListInclude;
}>;
export type InventoryUnitRecord = Prisma.InventoryUnitGetPayload<{
  include: typeof unitDetailInclude;
}>;

export interface IdentifierKey {
  type: IdentifierType;
  hmac: string;
}

@Injectable()
export class InventoryRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async listUnits(query: InventoryUnitListQueryDto) {
    const where: Prisma.InventoryUnitWhereInput = {
      ...(query.productId === undefined ? {} : { variant: { productId: query.productId } }),
      ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
      ...(query.locationId === undefined ? {} : { locationId: query.locationId }),
      ...(query.lifecycleStatus === undefined ? {} : { lifecycleStatus: query.lifecycleStatus }),
      ...(query.simLockStatus === undefined ? {} : { simLockStatus: query.simLockStatus }),
      ...(query.conditionGrade === undefined && query.minBatteryHealth === undefined
        ? {}
        : {
            inspections: {
              some: {
                isCurrent: true,
                status: 'COMPLETED',
                ...(query.conditionGrade === undefined
                  ? {}
                  : { conditionGrade: query.conditionGrade }),
                ...(query.minBatteryHealth === undefined
                  ? {}
                  : { batteryHealthPercent: { gte: query.minBatteryHealth } }),
              },
            },
          }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { inventoryCode: { contains: query.q, mode: 'insensitive' as const } },
              { variant: { sku: { contains: query.q, mode: 'insensitive' as const } } },
              {
                variant: {
                  displayName: { contains: query.q, mode: 'insensitive' as const },
                },
              },
              {
                variant: {
                  product: { name: { contains: query.q, mode: 'insensitive' as const } },
                },
              },
            ],
          }),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.InventoryUnitOrderByWithRelationInput;
    const [items, totalItems] = await Promise.all([
      this.prisma.inventoryUnit.findMany({
        where,
        include: unitListInclude,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryUnit.count({ where }),
    ]);
    return { items, totalItems };
  }

  public findUnit(id: string, client: DbClient = this.prisma) {
    return client.inventoryUnit.findUnique({ where: { id }, include: unitDetailInclude });
  }

  public findByIdentifier(type: IdentifierType, hmac: string, client: DbClient = this.prisma) {
    return client.inventoryUnit.findFirst({
      where:
        type === 'IMEI'
          ? { OR: [{ imei1Hmac: hmac }, { imei2Hmac: hmac }] }
          : type === 'SERIAL'
            ? { serialHmac: hmac }
            : { eidHmac: hmac },
      include: unitListInclude,
    });
  }

  public createUnit(data: Prisma.InventoryUnitUncheckedCreateInput, client: DbClient) {
    return client.inventoryUnit.create({ data, include: unitDetailInclude });
  }

  public updateUnit(id: string, data: Prisma.InventoryUnitUncheckedUpdateInput, client: DbClient) {
    return client.inventoryUnit.update({ where: { id }, data, include: unitDetailInclude });
  }

  public listLocations() {
    return this.prisma.inventoryLocation.findMany({ orderBy: [{ type: 'asc' }, { code: 'asc' }] });
  }

  public async hasActiveTransferTarget(currentLocationId: string): Promise<boolean> {
    return (
      (await this.prisma.inventoryLocation.count({
        where: { id: { not: currentLocationId }, status: 'ACTIVE' },
      })) > 0
    );
  }

  public async lockIdentifierKeys(keys: IdentifierKey[], client: Prisma.TransactionClient) {
    for (const hmac of [...new Set(keys.map((key) => key.hmac))].sort()) {
      await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${hmac}, 0))`;
    }
  }

  public findDuplicateIdentifier(
    keys: IdentifierKey[],
    excludeUnitId: string | undefined,
    client: Prisma.TransactionClient,
  ) {
    const conditions: Prisma.InventoryUnitWhereInput[] = keys.map((key) =>
      key.type === 'IMEI'
        ? { OR: [{ imei1Hmac: key.hmac }, { imei2Hmac: key.hmac }] }
        : key.type === 'SERIAL'
          ? { serialHmac: key.hmac }
          : { eidHmac: key.hmac },
    );
    if (conditions.length === 0) return Promise.resolve(null);
    return client.inventoryUnit.findFirst({
      where: {
        ...(excludeUnitId === undefined ? {} : { id: { not: excludeUnitId } }),
        OR: conditions,
      },
      select: { id: true },
    });
  }
}
