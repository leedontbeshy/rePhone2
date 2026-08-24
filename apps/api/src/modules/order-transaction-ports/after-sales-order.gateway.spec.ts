import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AfterSalesOrderGateway } from './after-sales-order.gateway.js';

const ITEM_ID = '0198e5a0-0000-7000-8000-000000000001';
const ORDER_ID = '0198e5a0-0000-7000-8000-000000000002';

describe('AfterSalesOrderGateway', () => {
  it('locks the Order root before the completed OrderItem and returns ownership context', async () => {
    const sequence: string[] = [];
    const item = completedItem();
    let itemReadCount = 0;
    const findUnique = vi.fn(() => {
      itemReadCount += 1;
      if (itemReadCount === 1) {
        sequence.push('read-root');
        return Promise.resolve({ orderId: ORDER_ID });
      }
      sequence.push('read-context');
      return Promise.resolve(item);
    });
    const queryRaw = vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      sequence.push(sql.includes('FROM orders ') ? 'lock-order' : 'lock-item');
      return Promise.resolve([{ id: sql.includes('FROM orders ') ? ORDER_ID : ITEM_ID }]);
    });
    const transaction = {
      orderItem: { findUnique },
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    const gateway = new AfterSalesOrderGateway({} as PrismaService);

    await expect(gateway.lockCompletedItem(ITEM_ID, transaction)).resolves.toEqual(item);
    expect(sequence).toEqual(['read-root', 'lock-order', 'lock-item', 'read-context']);
  });

  it('fails closed when the Order is not completed', async () => {
    const transaction = {
      orderItem: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ orderId: ORDER_ID })
          .mockResolvedValueOnce(
            completedItem({ order: { ...completedItem().order, status: 'PROCESSING' } }),
          ),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: ORDER_ID }]),
    } as unknown as Prisma.TransactionClient;

    await expect(
      new AfterSalesOrderGateway({} as PrismaService).lockCompletedItem(ITEM_ID, transaction),
    ).resolves.toBeNull();
  });
});

function completedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    orderId: ORDER_ID,
    order: {
      id: ORDER_ID,
      status: 'COMPLETED',
      completedAt: new Date('2026-08-25T00:00:00.000Z'),
      customerId: 'customer-1',
      guestAccessTokenHash: null,
      sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
    },
    ...overrides,
  };
}
