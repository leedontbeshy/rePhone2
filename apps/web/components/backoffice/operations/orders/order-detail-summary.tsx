import Link from 'next/link';
import {
  CheckCircleIcon,
  ClockIcon,
  StorefrontIcon,
  TruckIcon,
  WarningCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { StatusChip, formatVnd } from '@/components/ui';
import type { BackofficeOrderDetail } from '@/lib/fulfillment-api';
import { OperationsPanel, type OperationsTone } from '../operations-primitives';
import { formatOrderDateTime, orderStatusAxes } from './order-presenter';
import styles from './orders.module.css';

export function OrderSummaryBand({ detail }: Readonly<{ detail: BackofficeOrderDetail }>) {
  const axes = orderStatusAxes(detail);

  return (
    <section className={styles.orderSummaryBand} aria-label="Tổng quan đơn hàng">
      <div
        className={[styles.orderSummaryCell, styles.orderSummaryIdentity].filter(Boolean).join(' ')}
      >
        <span className={styles.orderSummaryLabel}>Đơn hàng</span>
        <h1>{detail.orderNumber}</h1>
        {detail.channel === 'DEALER' && (
          <Link href="/backoffice/dealers">Đơn đại lý · quản lý thanh toán và hoàn tiền</Link>
        )}
        <span className={styles.orderSummarySupporting}>
          Đặt lúc {formatOrderDateTime(detail.placedAt)}
        </span>
      </div>

      <div className={styles.orderSummaryCell}>
        <span className={styles.orderSummaryLabel}>Khách hàng</span>
        <strong>{detail.contact.fullName}</strong>
        <span className={styles.orderSummarySupporting}>{detail.contact.phone}</span>
      </div>

      <div className={styles.orderSummaryCell}>
        <span className={styles.orderSummaryLabel}>Giá trị đơn</span>
        <strong className={styles.orderSummaryMoney}>{formatVnd(detail.pricing.grandTotal)}</strong>
      </div>

      <div className={styles.orderSummaryCell}>
        <span className={styles.orderSummaryLabel}>Giao hàng</span>
        <span className={styles.orderSummaryDelivery}>
          {detail.fulfillmentType === 'PICKUP' ? (
            <StorefrontIcon aria-hidden="true" size={22} />
          ) : (
            <TruckIcon aria-hidden="true" size={22} />
          )}
          <strong>
            {detail.fulfillmentType === 'PICKUP' ? 'Nhận tại cửa hàng' : 'Giao tận nơi'}
          </strong>
        </span>
      </div>

      {axes.map((axis) => (
        <div className={styles.orderSummaryCell} key={`${axis.kind ?? 'generic'}:${axis.value}`}>
          <span className={styles.orderSummaryLabel}>{summaryAxisLabel(axis.kind)}</span>
          <StatusChip
            className={styles.orderSummaryStatus}
            data-tone={axis.tone ?? 'neutral'}
            icon={<SummaryStatusIcon tone={axis.tone ?? 'neutral'} />}
            label={axis.value}
            tone={axis.tone ?? 'neutral'}
          />
        </div>
      ))}
    </section>
  );
}

export function OrderFinancialSummary({ detail }: Readonly<{ detail: BackofficeOrderDetail }>) {
  return (
    <OperationsPanel className={styles.orderFinancialPanel} title="Tổng quan tài chính">
      <FinancialGroup
        rows={[
          { label: 'Tạm tính', value: formatVnd(detail.pricing.subtotal) },
          {
            label: 'Giảm giá',
            value: `−${formatVnd(detail.pricing.voucherDiscountAmount)}`,
          },
          ...(detail.fulfillmentType === 'SHIPPING'
            ? [{ label: 'Phí giao hàng', value: formatVnd(detail.pricing.shippingFee) }]
            : []),
          {
            emphasis: 'primary' as const,
            label: 'Tổng cộng',
            value: formatVnd(detail.pricing.grandTotal),
          },
        ]}
        title="Giá trị đơn"
      />
      <FinancialGroup
        rows={[
          { label: 'Đã thu', value: formatVnd(detail.pricing.paidAmount) },
          { label: 'Đã hoàn', value: formatVnd(detail.pricing.refundedAmount) },
          {
            emphasis: 'primary',
            label: 'Còn phải thu',
            value: formatVnd(detail.pricing.balanceDue),
          },
          { label: 'Còn có thể hoàn', value: formatVnd(detail.refundableAmount) },
        ]}
        title="Dòng tiền"
      />
    </OperationsPanel>
  );
}

function FinancialGroup({
  rows,
  title,
}: Readonly<{
  rows: readonly {
    emphasis?: 'primary';
    label: string;
    value: string;
  }[];
  title: string;
}>) {
  return (
    <section className={styles.financialGroup}>
      <h3>{title}</h3>
      <dl className={styles.financialRows}>
        {rows.map((row) => (
          <div data-emphasis={row.emphasis} key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function summaryAxisLabel(kind: 'order' | 'fulfillment' | 'payment' | 'generic' | undefined) {
  if (kind === 'order') return 'Trạng thái đơn';
  if (kind === 'fulfillment') return 'Trạng thái giao hàng';
  if (kind === 'payment') return 'Trạng thái thanh toán';
  return 'Trạng thái';
}

function SummaryStatusIcon({ tone }: Readonly<{ tone: OperationsTone }>) {
  if (tone === 'success') return <CheckCircleIcon size={15} weight="bold" />;
  if (tone === 'warning') return <WarningCircleIcon size={15} weight="bold" />;
  if (tone === 'danger') return <XCircleIcon size={15} weight="bold" />;
  return <ClockIcon size={15} weight="bold" />;
}
