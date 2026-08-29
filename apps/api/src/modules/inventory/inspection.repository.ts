import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const inspectionInclude = {
  inspector: { select: { id: true, fullName: true, employeeCode: true } },
} satisfies Prisma.InventoryInspectionInclude;

export type InspectionRecord = Prisma.InventoryInspectionGetPayload<{
  include: typeof inspectionInclude;
}>;

@Injectable()
export class InspectionRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async list(unitId: string, page: number, pageSize: number) {
    const where = { inventoryUnitId: unitId };
    const [items, totalItems] = await Promise.all([
      this.prisma.inventoryInspection.findMany({
        where,
        include: inspectionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryInspection.count({ where }),
    ]);
    return { items, totalItems };
  }

  public find(id: string, client: DbClient = this.prisma) {
    return client.inventoryInspection.findUnique({ where: { id }, include: inspectionInclude });
  }

  public findDraft(unitId: string, client: DbClient) {
    return client.inventoryInspection.findFirst({
      where: { inventoryUnitId: unitId, status: 'DRAFT' },
      include: inspectionInclude,
    });
  }

  public create(data: Prisma.InventoryInspectionUncheckedCreateInput, client: DbClient) {
    return client.inventoryInspection.create({ data, include: inspectionInclude });
  }

  public update(id: string, data: Prisma.InventoryInspectionUpdateInput, client: DbClient) {
    return client.inventoryInspection.update({ where: { id }, data, include: inspectionInclude });
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
