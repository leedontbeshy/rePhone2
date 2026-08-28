import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { StockLevelListQueryDto, StockMovementListQueryDto } from './stock.dto.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const stockLevelInclude = {
  variant: { include: { product: true } },
  location: true,
} satisfies Prisma.StockLevelInclude;

const stockMovementInclude = {
  variant: { include: { product: true } },
  fromLocation: true,
  toLocation: true,
  createdBy: { select: { id: true, fullName: true, employeeCode: true } },
} satisfies Prisma.StockMovementInclude;

export type StockLevelRecord = Prisma.StockLevelGetPayload<{ include: typeof stockLevelInclude }>;
export type StockMovementRecord = Prisma.StockMovementGetPayload<{
  include: typeof stockMovementInclude;
}>;

@Injectable()
export class StockRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async listLevels(query: StockLevelListQueryDto) {
    const where: Prisma.StockLevelWhereInput = {
      ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
      ...(query.locationId === undefined ? {} : { locationId: query.locationId }),
    };
    if (query.lowStock !== undefined) {
      const candidates = await this.prisma.stockLevel.findMany({
        where,
        include: stockLevelInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });
      const filtered = candidates.filter(
        (level) =>
          level.quantityOnHand - level.quantityReserved <= level.reorderThreshold ===
          query.lowStock,
      );
      return {
        items: filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
        totalItems: filtered.length,
      };
    }
    const [items, totalItems] = await Promise.all([
      this.prisma.stockLevel.findMany({
        where,
        include: stockLevelInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockLevel.count({ where }),
    ]);
    return { items, totalItems };
  }

  public async listMovements(query: StockMovementListQueryDto) {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
      ...(query.locationId === undefined
        ? {}
        : { OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }] }),
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.dateFrom === undefined && query.dateTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.dateFrom === undefined ? {} : { gte: new Date(query.dateFrom) }),
              ...(query.dateTo === undefined ? {} : { lte: new Date(query.dateTo) }),
            },
          }),
      ...(query.referenceType === undefined ? {} : { referenceType: query.referenceType }),
      ...(query.referenceId === undefined ? {} : { referenceId: query.referenceId }),
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: stockMovementInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, totalItems };
  }

  public ensureLevel(variantId: string, locationId: string, client: DbClient) {
    return client.stockLevel.upsert({
      where: { variantId_locationId: { variantId, locationId } },
      update: {},
      create: { variantId, locationId },
    });
  }

  public findLevel(variantId: string, locationId: string, client: DbClient) {
    return client.stockLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
      include: stockLevelInclude,
    });
  }

  public updateLevel(id: string, data: Prisma.StockLevelUpdateInput, client: DbClient) {
    return client.stockLevel.update({ where: { id }, data, include: stockLevelInclude });
  }

  public createMovement(data: Prisma.StockMovementUncheckedCreateInput, client: DbClient) {
    return client.stockMovement.create({ data, include: stockMovementInclude });
  }

  public findShipmentReturn(referenceId: string, variantId: string, client: DbClient) {
    return client.stockMovement.findFirst({
      where: {
        type: 'RETURN',
        referenceType: 'SHIPMENT',
        referenceId,
        variantId,
      },
      include: stockMovementInclude,
      orderBy: { id: 'asc' },
    });
  }

  public findAfterSalesReturn(referenceId: string, variantId: string, client: DbClient) {
    return client.stockMovement.findFirst({
      where: {
        type: 'RETURN',
        referenceType: 'AFTER_SALES_REQUEST',
        referenceId,
        variantId,
      },
      include: stockMovementInclude,
      orderBy: { id: 'asc' },
    });
  }

  public async lockLevels(ids: string[], client: Prisma.TransactionClient): Promise<void> {
    const uniqueIds = [...new Set(ids)].sort();
    await client.$queryRaw`
      SELECT id FROM stock_levels
      WHERE id IN (${Prisma.join(uniqueIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY id
      FOR UPDATE
    `;
  }
}
