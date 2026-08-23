import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service.js';
import {
  FulfillmentOrderGateway,
  fulfillmentOrderListSelect,
} from './fulfillment-order.gateway.js';

describe('FulfillmentOrderGateway list projection', () => {
  it('uses the lightweight list select instead of the full command/detail graph', async () => {
    const findMany = vi.fn((query: unknown) => {
      void query;
      return Promise.resolve([]);
    });
    const count = vi.fn(() => Promise.resolve(0));
    const gateway = new FulfillmentOrderGateway({
      order: { findMany, count },
    } as unknown as PrismaService);

    await expect(
      gateway.list({
        page: 1,
        pageSize: 20,
        sortBy: 'placedAt',
        sortOrder: 'desc',
        now: new Date('2026-08-23T10:00:00.000Z'),
      }),
    ).resolves.toEqual({ orders: [], totalItems: 0 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: fulfillmentOrderListSelect, skip: 0, take: 20 }),
    );
    const query = findMany.mock.calls[0]?.[0];
    expect(query).not.toHaveProperty('include');
    expect(fulfillmentOrderListSelect).not.toHaveProperty('refunds');
    expect(fulfillmentOrderListSelect.items).toHaveProperty('select');
    expect(fulfillmentOrderListSelect.payments.select).toEqual({
      purpose: true,
      method: true,
      status: true,
      submittedAt: true,
      expiresAt: true,
    });
    expect(fulfillmentOrderListSelect.shipments.select).toEqual({ status: true });
  });
});
