import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import { WarrantyTransactionGateway } from './warranty-transaction.gateway.js';

const WARRANTY_ID = '0198e5a0-0000-7000-8000-000000000001';
const ORIGINAL_UNIT_ID = '0198e5a0-0000-7000-8000-000000000002';
const REPLACEMENT_UNIT_ID = '0198e5a0-0000-7000-8000-000000000003';
const STAFF_ID = '0198e5a0-0000-7000-8000-000000000004';

describe('WarrantyTransactionGateway', () => {
  it('voids only an ACTIVE Warranty and persists the actor, reason and timestamp', async () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      warranty: {
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: WARRANTY_ID, status: 'VOIDED' }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new WarrantyTransactionGateway().voidActive(
        { id: WARRANTY_ID, reason: 'Hoàn tiền hậu mãi', actorUserId: STAFF_ID, now },
        transaction,
      ),
    ).resolves.toMatchObject({ id: WARRANTY_ID, status: 'VOIDED' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: WARRANTY_ID, status: 'ACTIVE' },
      data: {
        status: 'VOIDED',
        voidReason: 'Hoàn tiền hậu mãi',
        voidedById: STAFF_ID,
        voidedAt: now,
      },
    });
  });

  it('moves a Warranty only from the expected original unit', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      warranty: {
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: WARRANTY_ID,
          inventoryUnitId: REPLACEMENT_UNIT_ID,
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await new WarrantyTransactionGateway().moveToReplacementUnit(
      {
        id: WARRANTY_ID,
        originalInventoryUnitId: ORIGINAL_UNIT_ID,
        replacementInventoryUnitId: REPLACEMENT_UNIT_ID,
      },
      transaction,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: WARRANTY_ID, inventoryUnitId: ORIGINAL_UNIT_ID },
      data: { inventoryUnitId: REPLACEMENT_UNIT_ID },
    });
  });

  it('rejects a stale Warranty transition', async () => {
    const transaction = {
      warranty: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new WarrantyTransactionGateway().voidActive(
        {
          id: WARRANTY_ID,
          reason: 'Warranty đã bị xử lý',
          actorUserId: STAFF_ID,
          now: new Date(),
        },
        transaction,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });
});
