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
  ReceiptIcon,
  ShoppingBagIcon,
  ShoppingBagOpenIcon,
  StorefrontIcon,
  TagIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
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
          <p className={styles.eyebrow}>Trung tâm vận hành</p>
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
            variant="secondary"
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
    <div aria-busy={refreshing || undefined} className={styles.dashboard}>
      {refreshing ? (
        <p aria-live="polite" className={styles.refreshingNotice} role="status">
          Đang cập nhật dữ liệu; thông tin hiện tại vẫn có thể sử dụng.
        </p>
      ) : null}

      <section aria-labelledby="overview-metrics-title" className={styles.metricsSection}>
        <div className={styles.sectionHeadingCompact}>
          <div>
            <p className={styles.sectionEyebrow}>Hiện tại</p>
            <h2 id="overview-metrics-title">Tình hình vận hành</h2>
          </div>
          <span>Bốn nhóm cần theo dõi thường xuyên</span>
        </div>
        <div className={styles.metricsGrid}>
          {metrics.map((metric) => (
            <NextLink
              aria-label={`${metric.label}: ${formatOverviewCount(metric.value)}. Mở danh sách`}
              className={styles.metricCard}
              data-tone={metric.tone}
              href={metric.href}
              key={metric.key}
            >
              <span className={styles.metricTopline}>
                <span className={styles.metricIcon} aria-hidden="true">
                  <MetricIcon metric={metric.key} />
                </span>
                <ArrowRightIcon aria-hidden="true" className={styles.cardArrow} size={18} />
              </span>
              <span className={styles.metricValue}>{formatOverviewCount(metric.value)}</span>
              <span className={styles.metricLabel}>{metric.label}</span>
              <small>{metric.description}</small>
            </NextLink>
          ))}
        </div>
      </section>

      <div className={styles.workGrid}>
        <section aria-labelledby="overview-priority-title" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Theo mức ưu tiên</p>
              <h2 id="overview-priority-title">Hàng đợi cần chú ý</h2>
              <p>Xếp trước những hồ sơ đã chờ lâu hoặc cần phản hồi sớm.</p>
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
                      <span>{priority.description}</span>
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

        <section aria-labelledby="overview-quick-links-title" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Truy cập nhanh</p>
              <h2 id="overview-quick-links-title">Khu vực công việc</h2>
              <p>Các lối tắt được hiển thị theo quyền tài khoản.</p>
            </div>
          </div>
          <nav aria-label="Lối tắt công việc" className={styles.quickLinks}>
            {quickLinks.map((link) => (
              <NextLink className={styles.quickLink} href={link.href} key={link.href}>
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <QuickLinkIcon icon={link.icon} />
                </span>
                <span>
                  <strong>{link.label}</strong>
                  <small>{link.description}</small>
                </span>
                <ArrowRightIcon aria-hidden="true" className={styles.rowArrow} size={17} />
              </NextLink>
            ))}
          </nav>
        </section>
      </div>

      <RecentOrders orders={snapshot.recentOrders.slice(0, 5)} />
    </div>
  );
}

function RecentOrders({ orders }: Readonly<{ orders: readonly OperationsOverviewRecentOrder[] }>) {
  return (
    <section aria-labelledby="overview-recent-orders-title" className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Cập nhật mới</p>
          <h2 id="overview-recent-orders-title">Đơn hàng gần đây</h2>
          <p>Năm đơn mới nhất tại thời điểm tổng quan được tạo.</p>
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
        <div
          className={styles.ordersBoard}
          role="region"
          aria-label="Năm đơn hàng gần đây"
          tabIndex={0}
        >
          <div aria-hidden="true" className={styles.ordersHeader}>
            <span>Đơn hàng và khách</span>
            <span>Giá trị</span>
            <span>Trạng thái</span>
            <span />
          </div>
          <ol className={styles.orderRows}>
            {orders.map((order) => (
              <li key={order.id}>
                <NextLink
                  aria-label={`Mở đơn hàng ${order.orderNumber} của ${order.customerName}`}
                  className={styles.orderRow}
                  href={`/backoffice/orders/${encodeURIComponent(order.id)}`}
                >
                  <span className={styles.orderIdentity}>
                    <strong>{order.orderNumber}</strong>
                    <span>{order.customerName}</span>
                    <time dateTime={order.placedAt}>{formatOrderDateTime(order.placedAt)}</time>
                  </span>
                  <strong className={styles.orderTotal}>{formatVnd(order.grandTotal)}</strong>
                  <span className={styles.orderStatuses}>
                    <StatusChip
                      label={orderStatusLabel(order.status)}
                      tone={orderStatusTone(order.status)}
                    />
                    <StatusChip
                      label={fulfillmentStatusLabel(order.fulfillmentStatus)}
                      tone={fulfillmentStatusTone(order.fulfillmentStatus)}
                    />
                    <StatusChip
                      label={paymentStatusLabel(order.paymentStatus)}
                      tone={paymentStatusTone(order.paymentStatus)}
                    />
                  </span>
                  <ArrowRightIcon aria-hidden="true" className={styles.rowArrow} size={18} />
                </NextLink>
              </li>
            ))}
          </ol>
        </div>
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
            <Skeleton height="2.25rem" width="2.25rem" />
            <Skeleton height="2.25rem" width="42%" />
            <Skeleton height="1rem" width="66%" />
            <Skeleton height="0.875rem" width="82%" />
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
  if (icon === 'intake') return <StorefrontIcon size={21} />;
  if (icon === 'after-sales') return <HeadsetIcon size={21} />;
  if (icon === 'vouchers') return <TagIcon size={21} />;
  if (icon === 'settings') return <GearIcon size={21} />;
  if (icon === 'audit') return <ClockCounterClockwiseIcon size={21} />;
  return <HeartbeatIcon size={21} />;
}
