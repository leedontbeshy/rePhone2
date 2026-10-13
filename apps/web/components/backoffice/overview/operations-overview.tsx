'use client';

import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  CreditCardIcon,
  GearIcon,
  HeadsetIcon,
  HeartbeatIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  ShoppingBagOpenIcon,
  TagIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { joinClassNames } from '@/components/shells/shell-utils';
import { Button, InlineAlert, Skeleton, StatusChip, formatVnd } from '@/components/ui';
import {
  formatOrderDateTime,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from '../operations/orders/order-presenter';
import {
  formatOverviewCount,
  formatOverviewGeneratedAt,
  overviewMetricPresentations,
  overviewPriorityPresentations,
  overviewQuickLinks,
  type OverviewMetricKey,
  type OverviewQuickLinkIcon,
} from './overview-presenter';
import type {
  OperationsOverviewPriorityKey,
  OperationsOverviewProps,
  OperationsOverviewRecentOrder,
  OperationsOverviewSnapshot,
} from './overview-types';
import styles from './overview.module.css';

export function OperationsOverview({
  error,
  initialLoading,
  onRefresh,
  refreshing,
  role,
  snapshot,
}: OperationsOverviewProps) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.heading}>
          <h1>Tổng quan vận hành</h1>
          <p>Nắm nhanh tình hình hiện tại và mở đúng khu vực cần xử lý.</p>
        </div>
        <div className={styles.headerActions}>
          {snapshot === null ? null : (
            <p className={styles.generatedAt}>
              Cập nhật lúc{' '}
              <time dateTime={snapshot.generatedAt}>
                {formatOverviewGeneratedAt(snapshot.generatedAt)}
              </time>
            </p>
          )}
          <Button
            disabled={initialLoading && snapshot === null}
            iconLeading={<ArrowClockwiseIcon aria-hidden="true" size={19} />}
            loading={refreshing}
            loadingLabel="Đang cập nhật tổng quan"
            onClick={onRefresh}
          >
            Cập nhật
          </Button>
        </div>
      </header>

      {error === null ? null : snapshot === null ? (
        <OverviewErrorState error={error} refreshing={refreshing} onRefresh={onRefresh} />
      ) : (
        <InlineAlert title="Dữ liệu có thể chưa phải mới nhất" tone="warning">
          <div className={styles.inlineAlertContent}>
            <span>{error}</span>
            <Button
              loading={refreshing}
              loadingLabel="Đang thử tải lại"
              size="compact"
              variant="secondary"
              onClick={onRefresh}
            >
              Thử lại
            </Button>
          </div>
        </InlineAlert>
      )}

      {snapshot === null && initialLoading ? <OverviewLoadingState /> : null}
      {snapshot === null ? null : (
        <OverviewDashboard refreshing={refreshing} role={role} snapshot={snapshot} />
      )}
      {snapshot === null && !initialLoading && error === null ? (
        <OverviewEmptyState onRefresh={onRefresh} />
      ) : null}
    </div>
  );
}

export function OverviewDashboard({
  refreshing = false,
  role,
  snapshot,
}: Readonly<{
  refreshing?: boolean;
  role: OperationsOverviewProps['role'];
  snapshot: OperationsOverviewSnapshot;
}>) {
  const metrics = overviewMetricPresentations(snapshot.metrics);
  const priorities = overviewPriorityPresentations(snapshot.priorities);
  const quickLinks = overviewQuickLinks(role);

  return (
    <section
      aria-busy={refreshing || undefined}
      aria-label="Dữ liệu tổng quan vận hành"
      className={styles.dashboard}
    >
      {refreshing ? (
        <p aria-live="polite" className={styles.refreshingNotice} role="status">
          Đang cập nhật dữ liệu; thông tin hiện tại vẫn có thể sử dụng.
        </p>
      ) : null}

      <section aria-labelledby="overview-metrics-title" className={styles.metricsSection}>
        <h2 className="rp-visually-hidden" id="overview-metrics-title">
          Tình hình vận hành
        </h2>
        <div className={styles.metricsGrid}>
          {metrics.map((metric) => (
            <NextLink
              aria-label={`${metric.label}: ${formatOverviewCount(metric.value)}. Mở danh sách`}
              className={styles.metricCard}
              data-tone={metric.tone}
              href={metric.href}
              key={metric.key}
            >
              <span className={styles.metricIcon} aria-hidden="true">
                <MetricIcon metric={metric.key} />
              </span>
              <span className={styles.metricCopy}>
                <span className={styles.metricValue}>{formatOverviewCount(metric.value)}</span>
                <span className={styles.metricLabel}>{metric.label}</span>
              </span>
              <span className="rp-visually-hidden">{metric.description}</span>
            </NextLink>
          ))}
        </div>
      </section>

      <div className={styles.workGrid}>
        <section
          aria-labelledby="overview-priority-title"
          className={joinClassNames(styles.panel, styles.priorityPanel)}
        >
          <div className={styles.panelHeader}>
            <div>
              <h2 id="overview-priority-title">Hàng đợi cần chú ý</h2>
            </div>
            {priorities.length === 0 ? (
              <StatusChip label="Không có tồn đọng" tone="success" />
            ) : (
              <StatusChip
                label={`${formatOverviewCount(priorities.reduce((sum, item) => sum + item.count, 0))} việc`}
                tone="warning"
              />
            )}
          </div>

          {priorities.length === 0 ? (
            <div className={styles.priorityEmpty}>
              <span aria-hidden="true">
                <CheckCircleIcon size={28} weight="fill" />
              </span>
              <div>
                <h3>Chưa có hồ sơ cần ưu tiên</h3>
                <p>Các hàng đợi chính đang trong trạng thái ổn định.</p>
              </div>
            </div>
          ) : (
            <ol className={styles.priorityList}>
              {priorities.map((priority) => (
                <li key={priority.key}>
                  <NextLink
                    className={styles.priorityItem}
                    data-tone={priority.tone}
                    href={priority.safeHref}
                  >
                    <span className={styles.priorityIcon} aria-hidden="true">
                      <PriorityIcon priority={priority.key} />
                    </span>
                    <span className={styles.priorityCopy}>
                      <strong>{priority.label}</strong>
                      <span className="rp-visually-hidden">{priority.description}</span>
                      <small>{priority.oldestLabel}</small>
                    </span>
                    <span className={styles.priorityCount}>
                      {formatOverviewCount(priority.count)}
                    </span>
                    <ArrowRightIcon aria-hidden="true" className={styles.rowArrow} size={18} />
                  </NextLink>
                </li>
              ))}
            </ol>
          )}
        </section>

        <RecentOrders orders={snapshot.recentOrders.slice(0, 5)} />

        <section
          aria-labelledby="overview-quick-links-title"
          className={joinClassNames(styles.panel, styles.shortcutsPanel)}
        >
          <div className={styles.panelHeader}>
            <div>
              <h2 id="overview-quick-links-title">Thao tác nhanh</h2>
              <p>Truy cập nhanh các tác vụ theo quyền tài khoản.</p>
            </div>
          </div>
          <nav aria-label="Lối tắt công việc" className={styles.quickLinks}>
            {quickLinks.map((link) => (
              <NextLink
                className={styles.quickLink}
                data-icon={link.icon}
                href={link.href}
                key={link.href}
              >
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <QuickLinkIcon icon={link.icon} />
                </span>
                <span>
                  <strong>{link.label}</strong>
                  <small>{link.description}</small>
                </span>
              </NextLink>
            ))}
          </nav>
        </section>
      </div>
    </section>
  );
}

function RecentOrders({ orders }: Readonly<{ orders: readonly OperationsOverviewRecentOrder[] }>) {
  return (
    <section
      aria-labelledby="overview-recent-orders-title"
      className={joinClassNames(styles.panel, styles.ordersPanel)}
    >
      <div className={styles.panelHeader}>
        <div>
          <h2 id="overview-recent-orders-title">Đơn hàng gần đây</h2>
        </div>
        <NextLink className={styles.panelLink} href="/backoffice/orders">
          Xem tất cả đơn hàng
          <ArrowRightIcon aria-hidden="true" size={17} />
        </NextLink>
      </div>

      {orders.length === 0 ? (
        <div className={styles.ordersEmpty}>
          <ShoppingBagOpenIcon aria-hidden="true" size={28} />
          <div>
            <h3>Chưa có đơn hàng gần đây</h3>
            <p>Đơn mới sẽ xuất hiện tại đây sau khi được tạo.</p>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.ordersScrollHint} id="overview-orders-scroll-hint">
            Cuộn ngang để xem đủ trạng thái.
          </p>
          <div
            className={styles.ordersBoard}
            role="region"
            aria-label="Năm đơn hàng gần đây"
            aria-describedby="overview-orders-scroll-hint"
            tabIndex={0}
          >
            <table className={styles.ordersTable}>
              <caption className="rp-visually-hidden">
                Năm đơn mới nhất tại thời điểm tổng quan được tạo.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Đơn hàng và khách</th>
                  <th scope="col">Giá trị</th>
                  <th scope="col">Trạng thái đơn</th>
                  <th scope="col">Giao nhận</th>
                  <th scope="col">Thanh toán</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <th scope="row">
                      <NextLink
                        aria-label={`Mở đơn hàng ${order.orderNumber} của ${order.customerName}`}
                        className={styles.orderIdentity}
                        href={`/backoffice/orders/${encodeURIComponent(order.id)}`}
                      >
                        <strong>{order.orderNumber}</strong>
                        <span>{order.customerName}</span>
                        <time dateTime={order.placedAt}>{formatOrderDateTime(order.placedAt)}</time>
                      </NextLink>
                    </th>
                    <td className={styles.orderTotal}>{formatVnd(order.grandTotal)}</td>
                    <td>
                      <StatusChip
                        className={styles.orderStatus}
                        label={orderStatusLabel(order.status)}
                        tone={orderStatusTone(order.status)}
                      />
                    </td>
                    <td>
                      <StatusChip
                        className={styles.orderStatus}
                        label={fulfillmentStatusLabel(order.fulfillmentStatus)}
                        tone={fulfillmentStatusTone(order.fulfillmentStatus)}
                      />
                    </td>
                    <td>
                      <StatusChip
                        className={styles.orderStatus}
                        label={paymentStatusLabel(order.paymentStatus)}
                        tone={paymentStatusTone(order.paymentStatus)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function OverviewLoadingState() {
  return (
    <section aria-label="Đang tải tổng quan vận hành" className={styles.loadingState} role="status">
      <span className="rp-visually-hidden">Đang tải tổng quan vận hành…</span>
      <div aria-hidden="true" className={styles.loadingMetrics}>
        {Array.from({ length: 4 }, (_, index) => (
          <div className={styles.loadingMetric} key={index}>
            <Skeleton height="3rem" width="3rem" />
            <div>
              <Skeleton height="2rem" width="42%" />
              <Skeleton height="1rem" width="82%" />
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className={styles.loadingPanels}>
        {Array.from({ length: 2 }, (_, index) => (
          <div className={styles.loadingPanel} key={index}>
            <Skeleton height="1.5rem" width="42%" />
            <Skeleton height="4rem" width="100%" />
            <Skeleton height="4rem" width="100%" />
            <Skeleton height="4rem" width="100%" />
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewErrorState({
  error,
  onRefresh,
  refreshing,
}: Readonly<{ error: string; onRefresh: () => void; refreshing: boolean }>) {
  return (
    <section className={styles.blockingState}>
      <span className={styles.blockingStateIcon} aria-hidden="true">
        <WarningCircleIcon size={30} weight="fill" />
      </span>
      <div>
        <h2>Chưa tải được tổng quan vận hành</h2>
        <p>{error}</p>
      </div>
      <Button
        loading={refreshing}
        loadingLabel="Đang thử tải lại"
        variant="secondary"
        onClick={onRefresh}
      >
        Thử lại
      </Button>
    </section>
  );
}

function OverviewEmptyState({ onRefresh }: Readonly<{ onRefresh: () => void }>) {
  return (
    <section className={styles.blockingState}>
      <span className={styles.blockingStateIcon} aria-hidden="true">
        <ClipboardTextIcon size={30} />
      </span>
      <div>
        <h2>Chưa có dữ liệu tổng quan</h2>
        <p>Hãy tải lại để lấy tình hình vận hành mới nhất.</p>
      </div>
      <Button variant="secondary" onClick={onRefresh}>
        Tải lại
      </Button>
    </section>
  );
}

function MetricIcon({ metric }: Readonly<{ metric: OverviewMetricKey }>) {
  if (metric === 'activeOrders') return <ShoppingBagIcon size={23} />;
  if (metric === 'paymentsUnderReview') return <CreditCardIcon size={23} />;
  if (metric === 'openAfterSales') return <HeadsetIcon size={23} />;
  return <PackageIcon size={23} />;
}

function PriorityIcon({ priority }: Readonly<{ priority: OperationsOverviewPriorityKey }>) {
  if (priority === 'PAYMENT_REVIEW_OVERDUE') return <CreditCardIcon size={21} />;
  if (priority === 'PICKUP_OVERDUE') return <ClockCounterClockwiseIcon size={21} />;
  if (priority === 'REFUND_REQUESTED') return <ReceiptIcon size={21} />;
  return <HeadsetIcon size={21} />;
}

function QuickLinkIcon({ icon }: Readonly<{ icon: OverviewQuickLinkIcon }>): ReactNode {
  if (icon === 'orders') return <ShoppingBagIcon size={21} />;
  if (icon === 'payments') return <CreditCardIcon size={21} />;
  if (icon === 'intake') return <PlusIcon size={23} />;
  if (icon === 'after-sales') return <HeadsetIcon size={21} />;
  if (icon === 'vouchers') return <TagIcon size={21} />;
  if (icon === 'settings') return <GearIcon size={21} />;
  if (icon === 'audit') return <ClockCounterClockwiseIcon size={21} />;
  return <HeartbeatIcon size={21} />;
}
