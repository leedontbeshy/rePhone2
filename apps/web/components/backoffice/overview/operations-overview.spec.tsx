import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperationsOverview, OverviewDashboard } from './operations-overview';
import type { OperationsOverviewSnapshot } from './overview-types';

describe('operations overview component', () => {
  it('renders real metrics, priorities, five recent orders and localized order states', () => {
    const snapshot = overviewSnapshot();
    const markup = renderToStaticMarkup(<OverviewDashboard role="ADMIN" snapshot={snapshot} />);

    expect(markup).toContain('Tình hình vận hành');
    expect(markup).toContain('Đơn đang xử lý');
    expect(markup).toContain('Thanh toán chờ duyệt quá lâu');
    expect(markup).toContain('RPH-20260830-0001');
    expect(markup).toContain('RPH-20260830-0005');
    expect(markup).not.toContain('RPH-20260830-0006');
    expect(markup).toContain('Đang xử lý');
    expect(markup).toContain('Đang giao hàng');
    expect(markup).toContain('Đã thanh toán một phần');
    expect(markup).not.toContain('PROCESSING');
    expect(markup).toContain('href="/backoffice/settings"');
  });

  it('keeps loaded information visible during a nonblocking refresh', () => {
    const markup = renderToStaticMarkup(
      <OperationsOverview
        error={null}
        initialLoading={false}
        refreshing
        role="EMPLOYEE"
        snapshot={overviewSnapshot()}
        onRefresh={() => undefined}
      />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('thông tin hiện tại vẫn có thể sử dụng');
    expect(markup).toContain('RPH-20260830-0001');
    expect(markup).not.toContain('href="/backoffice/settings"');
    expect(markup).not.toContain('Đang tải tổng quan vận hành…');
  });

  it('keeps stale data visible with a useful refresh error', () => {
    const markup = renderToStaticMarkup(
      <OperationsOverview
        error="Không thể lấy dữ liệu mới."
        initialLoading={false}
        refreshing={false}
        role="EMPLOYEE"
        snapshot={overviewSnapshot()}
        onRefresh={() => undefined}
      />,
    );

    expect(markup).toContain('Dữ liệu có thể chưa phải mới nhất');
    expect(markup).toContain('Không thể lấy dữ liệu mới.');
    expect(markup).toContain('RPH-20260830-0001');
    expect(markup).toContain('Thử lại');
  });

  it('shows an honest first-load state without false empty messaging', () => {
    const markup = renderToStaticMarkup(
      <OperationsOverview
        error={null}
        initialLoading
        refreshing={false}
        role="EMPLOYEE"
        snapshot={null}
        onRefresh={() => undefined}
      />,
    );

    expect(markup).toContain('Đang tải tổng quan vận hành');
    expect(markup).not.toContain('Chưa có dữ liệu tổng quan');
    expect(markup).not.toContain('Chưa tải được tổng quan vận hành');
  });

  it('renders useful empty states when no queue or recent order needs attention', () => {
    const base = overviewSnapshot();
    const markup = renderToStaticMarkup(
      <OverviewDashboard
        role="EMPLOYEE"
        snapshot={{ ...base, priorities: [], recentOrders: [] }}
      />,
    );

    expect(markup).toContain('Chưa có hồ sơ cần ưu tiên');
    expect(markup).toContain('Chưa có đơn hàng gần đây');
    expect(markup).toContain('Không có tồn đọng');
  });
});

function overviewSnapshot(): OperationsOverviewSnapshot {
  return {
    generatedAt: '2026-08-30T06:30:00.000Z',
    metrics: {
      activeOrders: 12,
      lowStockLevels: 2,
      openAfterSales: 4,
      paymentsUnderReview: 3,
    },
    priorities: [
      {
        count: 2,
        href: '/backoffice/payments',
        key: 'PAYMENT_REVIEW_OVERDUE',
        oldestAt: '2026-08-29T04:30:00.000Z',
      },
    ],
    recentOrders: Array.from({ length: 6 }, (_, index) => ({
      customerName: `Khách hàng ${String(index + 1)}`,
      fulfillmentStatus: 'IN_TRANSIT' as const,
      grandTotal: '20500000',
      id: `order-${String(index + 1)}`,
      orderNumber: `RPH-20260830-000${String(index + 1)}`,
      paymentStatus: 'PARTIALLY_PAID' as const,
      placedAt: `2026-08-30T0${String(index)}:00:00.000Z`,
      status: 'PROCESSING' as const,
    })),
  };
}
