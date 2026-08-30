import type {
  OperationsOverviewMetrics,
  OperationsOverviewPriority,
  OperationsOverviewPriorityKey,
  OperationsOverviewRole,
} from './overview-types';

export type OverviewTone = 'brand' | 'info' | 'success' | 'warning' | 'danger';
export type OverviewMetricKey = keyof OperationsOverviewMetrics;
export type OverviewQuickLinkIcon =
  'after-sales' | 'audit' | 'health' | 'intake' | 'orders' | 'payments' | 'settings' | 'vouchers';

export interface OverviewMetricPresentation {
  readonly description: string;
  readonly href: string;
  readonly key: OverviewMetricKey;
  readonly label: string;
  readonly tone: OverviewTone;
  readonly value: number;
}

export interface OverviewPriorityPresentation extends OperationsOverviewPriority {
  readonly description: string;
  readonly label: string;
  readonly oldestLabel: string;
  readonly safeHref: string;
  readonly tone: 'info' | 'warning' | 'danger';
}

export interface OverviewQuickLink {
  readonly description: string;
  readonly href: string;
  readonly icon: OverviewQuickLinkIcon;
  readonly label: string;
}

const METRIC_DEFINITIONS: readonly Omit<OverviewMetricPresentation, 'value'>[] = [
  {
    description: 'Đơn chưa hoàn tất hoặc chưa hủy',
    href: '/backoffice/orders?sortBy=placedAt&sortOrder=desc',
    key: 'activeOrders',
    label: 'Đơn đang xử lý',
    tone: 'brand',
  },
  {
    description: 'Minh chứng cần nhân viên kiểm tra',
    href: '/backoffice/payments',
    key: 'paymentsUnderReview',
    label: 'Thanh toán chờ duyệt',
    tone: 'warning',
  },
  {
    description: 'Phiếu sau mua chưa kết thúc',
    href: '/backoffice/after-sales',
    key: 'openAfterSales',
    label: 'Hỗ trợ đang mở',
    tone: 'info',
  },
  {
    description: 'Mặt hàng đã chạm ngưỡng cảnh báo',
    href: '/backoffice/inventory/stock',
    key: 'lowStockLevels',
    label: 'Phụ kiện sắp hết',
    tone: 'danger',
  },
];

const PRIORITY_DEFINITIONS: Readonly<
  Record<
    OperationsOverviewPriorityKey,
    Readonly<{
      description: string;
      fallbackHref: string;
      label: string;
      rank: number;
      tone: 'info' | 'warning' | 'danger';
    }>
  >
> = {
  PAYMENT_REVIEW_OVERDUE: {
    description: 'Minh chứng đã chờ quá thời gian ưu tiên.',
    fallbackHref: '/backoffice/payments',
    label: 'Thanh toán chờ duyệt quá lâu',
    rank: 1,
    tone: 'danger',
  },
  PICKUP_OVERDUE: {
    description: 'Khách chưa nhận hàng sau thời hạn giữ.',
    fallbackHref: '/backoffice/orders?fulfillmentType=PICKUP&pickupOverdue=true',
    label: 'Đơn nhận tại cửa hàng quá hạn',
    rank: 2,
    tone: 'warning',
  },
  REFUND_REQUESTED: {
    description: 'Yêu cầu mới đang chờ nhân viên tiếp nhận.',
    fallbackHref: '/backoffice/refunds',
    label: 'Hoàn tiền chờ xử lý',
    rank: 3,
    tone: 'warning',
  },
  AFTER_SALES_REQUESTED: {
    description: 'Phiếu mới chưa được phân công xử lý.',
    fallbackHref: '/backoffice/after-sales',
    label: 'Hỗ trợ sau mua chờ tiếp nhận',
    rank: 4,
    tone: 'info',
  },
};

const STAFF_QUICK_LINKS: readonly OverviewQuickLink[] = [
  {
    description: 'Theo dõi và cập nhật giao nhận',
    href: '/backoffice/orders',
    icon: 'orders',
    label: 'Xử lý đơn hàng',
  },
  {
    description: 'Kiểm tra minh chứng của khách',
    href: '/backoffice/payments',
    icon: 'payments',
    label: 'Duyệt thanh toán',
  },
  {
    description: 'Tiếp nhận máy vào hệ thống',
    href: '/backoffice/inventory/intake',
    icon: 'intake',
    label: 'Nhập máy',
  },
  {
    description: 'Tiếp nhận và theo dõi phiếu',
    href: '/backoffice/after-sales',
    icon: 'after-sales',
    label: 'Hỗ trợ sau mua',
  },
];

const ADMIN_QUICK_LINKS: readonly OverviewQuickLink[] = [
  {
    description: 'Thiết lập chương trình ưu đãi',
    href: '/backoffice/vouchers',
    icon: 'vouchers',
    label: 'Mã ưu đãi',
  },
  {
    description: 'Cập nhật thông tin vận hành',
    href: '/backoffice/settings',
    icon: 'settings',
    label: 'Cấu hình cửa hàng',
  },
  {
    description: 'Xem thay đổi quan trọng',
    href: '/backoffice/audit-logs',
    icon: 'audit',
    label: 'Nhật ký hoạt động',
  },
  {
    description: 'Kiểm tra các dịch vụ kết nối',
    href: '/backoffice/system/health',
    icon: 'health',
    label: 'Trạng thái hệ thống',
  },
];

export function overviewMetricPresentations(
  metrics: OperationsOverviewMetrics,
): readonly OverviewMetricPresentation[] {
  return METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: metrics[definition.key],
  }));
}

export function overviewPriorityPresentations(
  priorities: readonly OperationsOverviewPriority[],
): readonly OverviewPriorityPresentation[] {
  return priorities
    .filter((priority) => priority.count > 0)
    .toSorted(
      (left, right) => PRIORITY_DEFINITIONS[left.key].rank - PRIORITY_DEFINITIONS[right.key].rank,
    )
    .map((priority) => {
      const definition = PRIORITY_DEFINITIONS[priority.key];
      return {
        ...priority,
        description: definition.description,
        label: definition.label,
        oldestLabel:
          priority.oldestAt === null
            ? 'Chưa ghi nhận thời điểm cũ nhất'
            : `Cũ nhất từ ${formatOverviewDateTime(priority.oldestAt)}`,
        safeHref: safeBackofficeHref(priority.href, definition.fallbackHref),
        tone: definition.tone,
      };
    });
}

export function overviewQuickLinks(role: OperationsOverviewRole): readonly OverviewQuickLink[] {
  return role === 'ADMIN' ? [...STAFF_QUICK_LINKS, ...ADMIN_QUICK_LINKS] : STAFF_QUICK_LINKS;
}

export function formatOverviewCount(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return new Intl.NumberFormat('vi-VN').format(safeValue);
}

export function formatOverviewDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

export function formatOverviewGeneratedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

function safeBackofficeHref(value: string, fallback: string): string {
  return value.startsWith('/backoffice/') && !value.startsWith('//') ? value : fallback;
}
