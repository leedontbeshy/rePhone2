import type {
  BackofficeFulfillmentStatus,
  BackofficeOrderStatus,
  BackofficePaymentStatus,
} from '@/lib/fulfillment-api';

export type OperationsOverviewRole = 'EMPLOYEE' | 'ADMIN';

export type OperationsOverviewPriorityKey =
  'PAYMENT_REVIEW_OVERDUE' | 'PICKUP_OVERDUE' | 'REFUND_REQUESTED' | 'AFTER_SALES_REQUESTED';

export interface OperationsOverviewMetrics {
  readonly activeOrders: number;
  readonly lowStockLevels: number;
  readonly openAfterSales: number;
  readonly paymentsUnderReview: number;
}

export interface OperationsOverviewPriority {
  readonly count: number;
  readonly href: string;
  readonly key: OperationsOverviewPriorityKey;
  readonly oldestAt: string | null;
}

export interface OperationsOverviewRecentOrder {
  readonly customerName: string;
  readonly fulfillmentStatus: BackofficeFulfillmentStatus;
  readonly grandTotal: string;
  readonly id: string;
  readonly orderNumber: string;
  readonly paymentStatus: BackofficePaymentStatus;
  readonly placedAt: string;
  readonly status: BackofficeOrderStatus;
}

export interface OperationsOverviewSnapshot {
  readonly generatedAt: string;
  readonly metrics: OperationsOverviewMetrics;
  readonly priorities: readonly OperationsOverviewPriority[];
  readonly recentOrders: readonly OperationsOverviewRecentOrder[];
}

export interface OperationsOverviewProps {
  readonly error: string | null;
  readonly initialLoading: boolean;
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
  readonly role: OperationsOverviewRole;
  readonly snapshot: OperationsOverviewSnapshot | null;
}
