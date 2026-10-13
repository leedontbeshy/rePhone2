import type { BackofficeNavigationGroup } from '@/components/shells/shell.types';
import type { PendingTaskCounts } from '@/lib/backoffice-pending-tasks';

const TASK_MENUS: Readonly<Record<string, readonly [keyof PendingTaskCounts, string]>> = {
  '/backoffice/orders': ['orders', 'đơn chờ xác nhận'],
  '/backoffice/payments': ['payments', 'thanh toán chờ duyệt'],
  '/backoffice/refunds': ['refunds', 'yêu cầu hoàn tiền chưa hoàn tất'],
  '/backoffice/after-sales': ['afterSales', 'yêu cầu hỗ trợ chưa hoàn tất'],
  '/backoffice/inventory/units': ['inventory', 'máy chờ kiểm định'],
  '/backoffice/dealers': ['dealers', 'tác vụ đại lý chờ xử lý'],
  '/backoffice/affiliates': ['affiliates', 'tác vụ cộng tác viên chờ xử lý'],
};

export function withPendingTaskBadges(
  groups: readonly BackofficeNavigationGroup[],
  counts: PendingTaskCounts | null,
): readonly BackofficeNavigationGroup[] {
  if (counts === null) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const task = TASK_MENUS[item.href.split('?')[0] ?? item.href];
      if (task === undefined || item.isDisabled) return item;
      const count = counts[task[0]];
      if (count === undefined || !Number.isSafeInteger(count) || count <= 0) return item;
      return { ...item, badgeCount: count, badgeLabel: task[1], badgeTone: 'danger' as const };
    }),
  }));
}
