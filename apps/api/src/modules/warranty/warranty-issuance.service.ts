import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { generateWarrantyCode } from './warranty-code.js';

export interface WarrantyEligibleItem {
  id: string;
  inventoryUnitId: string | null;
  warrantyDaysSnapshot: number;
  warrantyTermsSnapshot: string | null;
}

export interface IssuedWarranty {
  orderItemId: string;
  warrantyCode: string;
  startAt: Date;
  endAt: Date;
}

@Injectable()
export class WarrantyIssuanceService {
  public async issueForOrder(
    items: readonly WarrantyEligibleItem[],
    customerId: string | null,
    now: Date,
    timezone: string,
    transaction: Prisma.TransactionClient,
  ): Promise<IssuedWarranty[]> {
    const eligible = items.filter(({ warrantyDaysSnapshot }) => warrantyDaysSnapshot > 0);
    const existing =
      eligible.length === 0
        ? []
        : await transaction.warranty.findMany({
            where: { orderItemId: { in: eligible.map(({ id }) => id) } },
            select: { orderItemId: true, warrantyCode: true, startAt: true, endAt: true },
          });
    const byItem = new Map(existing.map((warranty) => [warranty.orderItemId, warranty]));
    const issued: IssuedWarranty[] = [];
    for (const item of eligible) {
      const alreadyIssued = byItem.get(item.id);
      if (alreadyIssued !== undefined) {
        issued.push(alreadyIssued);
        continue;
      }
      const terms = item.warrantyTermsSnapshot?.trim();
      if (terms === undefined || terms.length === 0) throw new ApiError('INTERNAL_ERROR');
      const endAt = new Date(now.getTime() + item.warrantyDaysSnapshot * 86_400_000);
      let created: IssuedWarranty | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const warrantyCode = generateWarrantyCode(now, timezone);
        const inserted = await transaction.warranty.createMany({
          data: [
            {
              warrantyCode,
              orderItemId: item.id,
              customerId,
              inventoryUnitId: item.inventoryUnitId,
              policyId: null,
              daysSnapshot: item.warrantyDaysSnapshot,
              termsSnapshot: terms,
              startAt: now,
              endAt,
              status: 'ACTIVE',
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count === 1) {
          created = await transaction.warranty.findUniqueOrThrow({
            where: { warrantyCode },
            select: { orderItemId: true, warrantyCode: true, startAt: true, endAt: true },
          });
          break;
        }
        const codeCollision = await transaction.warranty.findUnique({
          where: { warrantyCode },
          select: { id: true },
        });
        if (codeCollision === null) throw new ApiError('INTERNAL_ERROR');
      }
      if (created === null) throw new ApiError('CONCURRENT_MODIFICATION');
      issued.push(created);
    }
    return issued;
  }
}
