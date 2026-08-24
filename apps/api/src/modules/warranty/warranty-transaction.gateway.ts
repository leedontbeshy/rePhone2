import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';

const warrantySelect = {
  id: true,
  warrantyCode: true,
  orderItemId: true,
  customerId: true,
  inventoryUnitId: true,
  policyId: true,
  daysSnapshot: true,
  termsSnapshot: true,
  startAt: true,
  endAt: true,
  status: true,
  voidReason: true,
  voidedById: true,
  voidedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarrantySelect;

const policySelect = {
  id: true,
  code: true,
  name: true,
  defaultDays: true,
  terms: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarrantyPolicySelect;

export type LockedWarranty = Prisma.WarrantyGetPayload<{ select: typeof warrantySelect }>;
export type LockedWarrantyPolicy = Prisma.WarrantyPolicyGetPayload<{
  select: typeof policySelect;
}>;

@Injectable()
export class WarrantyTransactionGateway {
  public async lockById(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<LockedWarranty | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM warranties WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) return null;
    return transaction.warranty.findUnique({ where: { id }, select: warrantySelect });
  }

  public async lockByOrderItem(
    orderItemId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<LockedWarranty | null> {
    const existing = await transaction.warranty.findUnique({
      where: { orderItemId },
      select: { id: true },
    });
    if (existing === null) return null;
    return this.lockById(existing.id, transaction);
  }

  public async lockPolicy(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<LockedWarrantyPolicy | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM warranty_policies WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) return null;
    return transaction.warrantyPolicy.findUnique({ where: { id }, select: policySelect });
  }

  public async voidActive(
    input: { id: string; reason: string; actorUserId: string; now: Date },
    transaction: Prisma.TransactionClient,
  ): Promise<LockedWarranty> {
    const updated = await transaction.warranty.updateMany({
      where: { id: input.id, status: 'ACTIVE' },
      data: {
        status: 'VOIDED',
        voidReason: input.reason,
        voidedById: input.actorUserId,
        voidedAt: input.now,
      },
    });
    if (updated.count !== 1) throw new ApiError('INVALID_STATE_TRANSITION');
    return transaction.warranty.findUniqueOrThrow({
      where: { id: input.id },
      select: warrantySelect,
    });
  }

  public async moveToReplacementUnit(
    input: { id: string; originalInventoryUnitId: string; replacementInventoryUnitId: string },
    transaction: Prisma.TransactionClient,
  ): Promise<LockedWarranty> {
    const updated = await transaction.warranty.updateMany({
      where: {
        id: input.id,
        inventoryUnitId: input.originalInventoryUnitId,
      },
      data: { inventoryUnitId: input.replacementInventoryUnitId },
    });
    if (updated.count !== 1) throw new ApiError('INVALID_STATE_TRANSITION');
    return transaction.warranty.findUniqueOrThrow({
      where: { id: input.id },
      select: warrantySelect,
    });
  }
}
