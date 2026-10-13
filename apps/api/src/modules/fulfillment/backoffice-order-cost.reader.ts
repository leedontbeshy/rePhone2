import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type {
  BackofficeOrderCostSummaryDto,
  BackofficeOrderItemCostDto,
} from './fulfillment-response.dto.js';

interface OrderCosts {
  summary: BackofficeOrderCostSummaryDto;
  items: Map<string, BackofficeOrderItemCostDto>;
}

/** Costs are current inventory values, not a sale-time snapshot. Never read them for employees. */
@Injectable()
export class BackofficeOrderCostReader {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async read(
    orderIds: readonly string[],
    role: AuthContext['role'],
  ): Promise<Map<string, OrderCosts>> {
    const result = new Map<string, OrderCosts>();
    if (role !== 'ADMIN' || orderIds.length === 0) return result;
    for (const id of orderIds) {
      result.set(id, {
        summary: {
          source: 'CURRENT_INVENTORY',
          knownCost: '0',
          totalCost: '0',
          missingQuantity: 0,
        },
        items: new Map(),
      });
    }
    const rows = await this.prisma.orderItem.findMany({
      where: { orderId: { in: [...result.keys()] } },
      select: {
        id: true,
        orderId: true,
        quantity: true,
        inventoryUnit: { select: { id: true, acquisitionCost: true, additionalCost: true } },
      },
    });
    for (const row of rows) {
      const order = result.get(row.orderId);
      if (order === undefined) continue;
      const unit = row.inventoryUnit;
      const acquisitionCost = unit?.acquisitionCost?.toString() ?? null;
      const additionalCost = unit?.additionalCost.toString() ?? null;
      const unitCost =
        acquisitionCost === null || additionalCost === null
          ? null
          : BigInt(acquisitionCost) + BigInt(additionalCost);
      const lineCost = unitCost === null ? null : unitCost * BigInt(row.quantity);
      order.items.set(row.id, {
        inventoryUnitId: unit?.id ?? null,
        acquisitionCost,
        additionalCost,
        unitCost: unitCost?.toString() ?? null,
        lineCost: lineCost?.toString() ?? null,
      });
      if (lineCost === null) order.summary.missingQuantity += row.quantity;
      else order.summary.knownCost = (BigInt(order.summary.knownCost) + lineCost).toString();
      order.summary.totalCost = order.summary.missingQuantity > 0 ? null : order.summary.knownCost;
    }
    return result;
  }
}
