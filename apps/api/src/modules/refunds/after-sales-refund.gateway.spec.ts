import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import { AfterSalesRefundGateway } from './after-sales-refund.gateway.js';

const REFUND_ID = '0198e5a0-0000-7000-8000-000000000001';
const ORDER_ID = '0198e5a0-0000-7000-8000-000000000002';

describe('AfterSalesRefundGateway', () => {
  it('returns only a locked completed Refund belonging to the same Order', async () => {
    const completedAt = new Date('2026-08-25T00:00:00.000Z');
    const findFirst = vi.fn().mockResolvedValue({
      id: REFUND_ID,
      orderId: ORDER_ID,
      paymentId: null,
      amount: 500_000n,
      method: 'BANK_TRANSFER',
      completedAt,
    });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: REFUND_ID }]),
      refund: { findFirst },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new AfterSalesRefundGateway().lockCompletedForOrder(REFUND_ID, ORDER_ID, transaction),
    ).resolves.toMatchObject({ id: REFUND_ID, orderId: ORDER_ID, amount: '500000', completedAt });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: REFUND_ID,
          orderId: ORDER_ID,
          status: 'COMPLETED',
          completedAt: { not: null },
        },
      }),
    );
  });

  it('returns null without querying details when the Refund does not exist', async () => {
    const findFirst = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      refund: { findFirst },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new AfterSalesRefundGateway().lockCompletedForOrder(REFUND_ID, ORDER_ID, transaction),
    ).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
