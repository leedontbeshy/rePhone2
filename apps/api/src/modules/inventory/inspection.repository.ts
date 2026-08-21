import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InspectionRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async list(unitId: string, page: number, pageSize: number) {
    const where = { inventoryUnitId: unitId };
    const [items, totalItems] = await Promise.all([
      this.prisma.inventoryInspection.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryInspection.count({ where }),
    ]);
    return { items, totalItems };
  }

  public find(id: string, client: DbClient = this.prisma) {
    return client.inventoryInspection.findUnique({ where: { id } });
  }

  public findDraft(unitId: string, client: DbClient) {
    return client.inventoryInspection.findFirst({
      where: { inventoryUnitId: unitId, status: 'DRAFT' },
    });
  }

  public create(data: Prisma.InventoryInspectionUncheckedCreateInput, client: DbClient) {
    return client.inventoryInspection.create({ data });
  }

  public update(id: string, data: Prisma.InventoryInspectionUpdateInput, client: DbClient) {
    return client.inventoryInspection.update({ where: { id }, data });
  }

  public clearCurrent(unitId: string, client: DbClient) {
    return client.inventoryInspection.updateMany({
      where: { inventoryUnitId: unitId, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  public async lockUnit(unitId: string, client: Prisma.TransactionClient): Promise<boolean> {
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM inventory_units WHERE id = ${unitId}::uuid FOR UPDATE
    `;
    return rows.length === 1;
  }
}
