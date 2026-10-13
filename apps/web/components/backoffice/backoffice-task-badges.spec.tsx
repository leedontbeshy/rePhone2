import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavigationList } from '@/components/shells/shell-parts';
import { backofficeNavigationForRole } from './backoffice-navigation';
import { withPendingTaskBadges } from './backoffice-task-badges';

const counts = {
  orders: 2,
  payments: 0,
  refunds: 1,
  afterSales: 0,
  inventory: 3,
  dealers: 4,
  affiliates: 105,
};

describe('sidebar task badges', () => {
  it('shows only positive queues and preserves destinations and accessible full counts', () => {
    const navigation = backofficeNavigationForRole('ADMIN', '/backoffice/orders');
    const items = withPendingTaskBadges(navigation, counts).flatMap((group) => group.items);
    const order = items.find((item) => item.href === '/backoffice/orders');
    expect(order).toMatchObject({ badgeCount: 2, badgeLabel: 'đơn chờ xác nhận', isCurrent: true });
    expect(items.find((item) => item.href === '/backoffice/payments')).not.toHaveProperty(
      'badgeCount',
    );
    const markup = renderToStaticMarkup(<NavigationList items={items} />);
    expect(markup).toContain('aria-label="Danh sách đơn hàng, 2 đơn chờ xác nhận"');
    expect(markup).toContain('aria-label="Cộng tác viên, 105 tác vụ cộng tác viên chờ xử lý"');
    expect(markup).toContain('>99+</span>');
    expect(
      navigation.flatMap((group) => group.items).every((item) => item.badgeCount === undefined),
    ).toBe(true);
  });

  it('never badges disabled navigation or unavailable counts', () => {
    const navigation = backofficeNavigationForRole('EMPLOYEE', '/backoffice');
    const items = withPendingTaskBadges(navigation, counts).flatMap((group) => group.items);
    expect(items.find((item) => item.href === '/backoffice/affiliates')).toMatchObject({
      isDisabled: true,
    });
    expect(items.find((item) => item.href === '/backoffice/affiliates')).not.toHaveProperty(
      'badgeCount',
    );
    expect(withPendingTaskBadges(navigation, null)).toBe(navigation);
  });
});
