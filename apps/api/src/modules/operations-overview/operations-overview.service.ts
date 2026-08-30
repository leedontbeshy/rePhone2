import { Inject, Injectable } from '@nestjs/common';
import type {
  OperationsOverviewDto,
  OperationsOverviewPriorityDto,
} from './operations-overview-response.dto.js';
import { OperationsOverviewRepository } from './operations-overview.repository.js';

@Injectable()
export class OperationsOverviewService {
  public constructor(
    @Inject(OperationsOverviewRepository)
    private readonly repository: OperationsOverviewRepository,
  ) {}

  public async get(now = new Date()): Promise<{ data: OperationsOverviewDto }> {
    const { aggregates, recentOrders } = await this.repository.read(now);
    const priorities: OperationsOverviewPriorityDto[] = [
      {
        key: 'PAYMENT_REVIEW_OVERDUE',
        count: aggregates.overduePaymentReviews,
        oldestAt: isoOrNull(aggregates.oldestOverduePaymentAt),
        href: '/backoffice/payments?status=UNDER_REVIEW&reviewOverdue=true',
      },
      {
        key: 'PICKUP_OVERDUE',
        count: aggregates.overduePickups,
        oldestAt: isoOrNull(aggregates.oldestOverduePickupAt),
        href: '/backoffice/orders?fulfillmentType=PICKUP&pickupOverdue=true&sortBy=pickupHoldUntil&sortOrder=asc',
      },
      {
        key: 'REFUND_REQUESTED',
        count: aggregates.requestedRefunds,
        oldestAt: isoOrNull(aggregates.oldestRequestedRefundAt),
        href: '/backoffice/refunds?status=REQUESTED',
      },
      {
        key: 'AFTER_SALES_REQUESTED',
        count: aggregates.requestedAfterSales,
        oldestAt: isoOrNull(aggregates.oldestRequestedAfterSalesAt),
        href: '/backoffice/after-sales?status=REQUESTED',
      },
    ];

    return {
      data: {
        generatedAt: now.toISOString(),
        metrics: {
          activeOrders: aggregates.activeOrders,
          paymentsUnderReview: aggregates.paymentsUnderReview,
          openAfterSales: aggregates.openAfterSales,
          lowStockLevels: aggregates.lowStockLevels,
        },
        priorities,
        recentOrders: recentOrders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          status: order.status,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentStatus: order.paymentStatus,
          grandTotal: order.grandTotal.toString(),
          placedAt: order.placedAt.toISOString(),
        })),
      },
    };
  }
}

function isoOrNull(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
