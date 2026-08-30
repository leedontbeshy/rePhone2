import { Decimal } from '../../generated/prisma/internal/prismaNamespace.js';
import { describe, expect, it, vi } from 'vitest';
import type { OperationsOverviewRepository } from './operations-overview.repository.js';
import { OperationsOverviewService } from './operations-overview.service.js';

const NOW = new Date('2026-08-30T12:00:00.000Z');

describe('OperationsOverviewService', () => {
  it('projects authoritative counts, priorities, and safe recent order fields', async () => {
    const repository = {
      read: vi.fn().mockResolvedValue({
        aggregates: {
          activeOrders: 7,
          paymentsUnderReview: 3,
          openAfterSales: 2,
          lowStockLevels: 4,
          overduePaymentReviews: 1,
          oldestOverduePaymentAt: new Date('2026-08-30T10:00:00.000Z'),
          overduePickups: 0,
          oldestOverduePickupAt: null,
          requestedRefunds: 2,
          oldestRequestedRefundAt: new Date('2026-08-29T10:00:00.000Z'),
          requestedAfterSales: 1,
          oldestRequestedAfterSalesAt: new Date('2026-08-30T08:00:00.000Z'),
        },
        recentOrders: [
          {
            id: '01991c68-8d3f-73a6-8f92-3c7381af4600',
            orderNumber: 'RPH-20260830-ABC123',
            customerName: 'Khách hàng Demo',
            status: 'PLACED',
            fulfillmentStatus: 'PENDING',
            paymentStatus: 'UNPAID',
            grandTotal: new Decimal(12300000),
            placedAt: new Date('2026-08-30T11:45:00.000Z'),
          },
        ],
      }),
    };

    const result = await new OperationsOverviewService(
      repository as unknown as OperationsOverviewRepository,
    ).get(NOW);

    expect(result.data.generatedAt).toBe(NOW.toISOString());
    expect(result.data.metrics).toEqual({
      activeOrders: 7,
      paymentsUnderReview: 3,
      openAfterSales: 2,
      lowStockLevels: 4,
    });
    expect(result.data.priorities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'PAYMENT_REVIEW_OVERDUE',
          count: 1,
          oldestAt: '2026-08-30T10:00:00.000Z',
        }),
        expect.objectContaining({ key: 'PICKUP_OVERDUE', count: 0, oldestAt: null }),
      ]),
    );
    expect(result.data.recentOrders).toEqual([
      expect.objectContaining({
        orderNumber: 'RPH-20260830-ABC123',
        grandTotal: '12300000',
        placedAt: '2026-08-30T11:45:00.000Z',
      }),
    ]);
  });
});
