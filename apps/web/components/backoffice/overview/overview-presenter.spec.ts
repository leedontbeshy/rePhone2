import { describe, expect, it } from 'vitest';
import {
  formatOverviewCount,
  formatOverviewDateTime,
  formatOverviewGeneratedAt,
  overviewMetricPresentations,
  overviewPriorityPresentations,
  overviewQuickLinks,
} from './overview-presenter';

describe('operations overview presenter', () => {
  it('keeps the four approved metrics in an operational reading order', () => {
    const metrics = overviewMetricPresentations({
      activeOrders: 17,
      lowStockLevels: 4,
      openAfterSales: 6,
      paymentsUnderReview: 3,
    });

    expect(metrics.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'activeOrders', value: 17 },
      { key: 'paymentsUnderReview', value: 3 },
      { key: 'openAfterSales', value: 6 },
      { key: 'lowStockLevels', value: 4 },
    ]);
    expect(metrics.every((metric) => metric.href.startsWith('/backoffice/'))).toBe(true);
  });

  it('hides zero-count priorities, orders the urgent queues, and rejects external links', () => {
    const priorities = overviewPriorityPresentations([
      {
        count: 2,
        href: 'https://example.com/steal-session',
        key: 'AFTER_SALES_REQUESTED',
        oldestAt: null,
      },
      {
        count: 1,
        href: '/backoffice/payments?age=overdue',
        key: 'PAYMENT_REVIEW_OVERDUE',
        oldestAt: '2026-08-30T01:00:00.000Z',
      },
      {
        count: 0,
        href: '/backoffice/refunds',
        key: 'REFUND_REQUESTED',
        oldestAt: null,
      },
    ]);

    expect(priorities.map((priority) => priority.key)).toEqual([
      'PAYMENT_REVIEW_OVERDUE',
      'AFTER_SALES_REQUESTED',
    ]);
    expect(priorities[0]?.safeHref).toBe('/backoffice/payments?age=overdue');
    expect(priorities[1]?.safeHref).toBe('/backoffice/after-sales');
    expect(priorities[1]?.oldestLabel).toBe('Chưa ghi nhận thời điểm cũ nhất');
  });

  it('keeps administrator-only links away from employee dashboards', () => {
    const employeeLinks = overviewQuickLinks('EMPLOYEE');
    const adminLinks = overviewQuickLinks('ADMIN');

    expect(employeeLinks.map((link) => link.href)).not.toContain('/backoffice/settings');
    expect(employeeLinks.map((link) => link.href)).not.toContain('/backoffice/audit-logs');
    expect(adminLinks.map((link) => link.href)).toContain('/backoffice/settings');
    expect(adminLinks.map((link) => link.href)).toContain('/backoffice/system/health');
  });

  it('formats counters and timestamps defensively for Vietnamese operators', () => {
    expect(formatOverviewCount(1234)).toBe('1.234');
    expect(formatOverviewCount(Number.NaN)).toBe('0');
    expect(formatOverviewDateTime('invalid')).toBe('chưa xác định');
    expect(formatOverviewGeneratedAt('invalid')).toBe('Chưa xác định');
  });
});
