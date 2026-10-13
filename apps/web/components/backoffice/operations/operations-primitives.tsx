import {
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  PackageIcon,
  ShoppingBagIcon,
  TruckIcon,
} from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';
import { Button, StatusChip } from '@/components/ui';
import styles from './operations.module.css';

export type OperationsTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface OperationsPageHeaderProps {
  readonly actions?: ReactNode;
  readonly description?: ReactNode;
  readonly eyebrow?: string;
  readonly meta?: ReactNode;
  readonly title: string;
}

export function OperationsPageHeader({
  actions,
  description,
  eyebrow,
  meta,
  title,
}: OperationsPageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}>
        {eyebrow === undefined ? null : <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1>{title}</h1>
        {description === undefined ? null : (
          <div className={styles.pageDescription}>{description}</div>
        )}
        {meta === undefined ? null : <div className={styles.pageMeta}>{meta}</div>}
      </div>
      {actions === undefined ? null : <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

export interface OperationsStatusAxis {
  readonly kind?: 'order' | 'fulfillment' | 'payment' | 'generic';
  readonly label: string;
  readonly tone?: OperationsTone;
  readonly value: string;
}

export function OperationsStatusAxes({
  axes,
  label = 'Trạng thái hồ sơ',
}: Readonly<{ axes: readonly OperationsStatusAxis[]; label?: string }>) {
  return (
    <section className={styles.statusAxes} aria-label={label}>
      {axes.map((axis) => (
        <div className={styles.statusAxis} key={`${axis.label}:${axis.value}`}>
          <span className={styles.statusAxisIcon} aria-hidden="true">
            <StatusAxisIcon kind={axis.kind ?? 'generic'} />
          </span>
          <span className={styles.statusAxisCopy}>
            <strong>{axis.label}</strong>
            <StatusChip label={axis.value} tone={axis.tone ?? 'neutral'} />
          </span>
        </div>
      ))}
    </section>
  );
}

export interface OperationsPanelProps {
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly description?: ReactNode;
  readonly title?: string;
}

export function OperationsPanel({
  action,
  children,
  className,
  description,
  title,
}: OperationsPanelProps) {
  const hasHeader = title !== undefined || description !== undefined || action !== undefined;
  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')}>
      {hasHeader ? (
        <div className={styles.panelHeader}>
          <div>
            {title === undefined ? null : <h2>{title}</h2>}
            {description === undefined ? null : (
              <div className={styles.panelDescription}>{description}</div>
            )}
          </div>
          {action === undefined ? null : <div className={styles.panelAction}>{action}</div>}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface OperationsPaginationProps {
  readonly className?: string | undefined;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPageChange: (page: number) => void;
  readonly page: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export function OperationsPagination({
  className,
  disabled = false,
  label,
  onPageChange,
  page,
  totalItems,
  totalPages,
}: OperationsPaginationProps) {
  return (
    <nav className={className} aria-label={label}>
      <Button
        disabled={disabled || page <= 1}
        size="compact"
        type="button"
        variant="secondary"
        onClick={() => {
          onPageChange(page - 1);
        }}
      >
        Trang trước
      </Button>
      <span aria-live="polite">{String(totalItems)} kết quả</span>
      <Button
        disabled={disabled || page >= totalPages}
        size="compact"
        type="button"
        variant="secondary"
        onClick={() => {
          onPageChange(page + 1);
        }}
      >
        Trang sau
      </Button>
    </nav>
  );
}

export function OperationsDetailLayout({
  main,
  rail,
}: Readonly<{ main: ReactNode; rail: ReactNode }>) {
  return (
    <div className={styles.detailLayout}>
      <aside className={styles.detailRail}>{rail}</aside>
      <div className={styles.detailMain}>{main}</div>
    </div>
  );
}

export interface OperationsActionRailProps {
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly primary?: ReactNode;
  readonly supporting?: ReactNode;
  readonly title: string;
}

export function OperationsActionRail({
  children,
  description,
  primary,
  supporting,
  title,
}: OperationsActionRailProps) {
  return (
    <OperationsPanel className={styles.actionRail} title={title}>
      {primary === undefined ? null : <div className={styles.primaryAction}>{primary}</div>}
      {description === undefined ? null : (
        <div className={styles.actionDescription}>{description}</div>
      )}
      {supporting === undefined ? null : (
        <div className={styles.supportingActions}>{supporting}</div>
      )}
      {children}
    </OperationsPanel>
  );
}

export interface OperationsTimelineItem {
  readonly at?: string | null;
  readonly description?: ReactNode;
  readonly label: string;
  readonly state?: 'complete' | 'current' | 'pending' | 'danger';
}

export interface OperationsTimelineProps {
  readonly items: readonly OperationsTimelineItem[];
  readonly label?: string;
  readonly orientation?: 'vertical' | 'horizontal';
}

export function OperationsTimeline({
  items,
  label = 'Lịch sử xử lý',
  orientation = 'vertical',
}: OperationsTimelineProps) {
  return (
    <ol className={styles.timeline} aria-label={label} data-orientation={orientation}>
      {items.map((item, index) => (
        <li data-state={item.state ?? 'complete'} key={`${item.label}:${item.at ?? String(index)}`}>
          <span className={styles.timelineMarker} aria-hidden="true">
            {item.state === 'current' ? <ClockIcon size={16} /> : <CheckCircleIcon size={16} />}
          </span>
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeading}>
              <strong>{item.label}</strong>
              {item.at === undefined || item.at === null ? null : <time>{item.at}</time>}
            </div>
            {item.description === undefined ? null : (
              <div className={styles.timelineDescription}>{item.description}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface OperationsMoneyRow {
  readonly emphasis?: 'strong' | 'primary' | 'danger';
  readonly label: string;
  readonly value: ReactNode;
}

export function OperationsMoneySummary({
  rows,
  title = 'Tổng quan tài chính',
}: Readonly<{ rows: readonly OperationsMoneyRow[]; title?: string }>) {
  return (
    <OperationsPanel className={styles.moneyPanel} title={title}>
      <dl className={styles.moneyRows}>
        {rows.map((row) => (
          <div data-emphasis={row.emphasis} key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </OperationsPanel>
  );
}

function StatusAxisIcon({ kind }: Readonly<{ kind: NonNullable<OperationsStatusAxis['kind']> }>) {
  const props = { size: 24, weight: 'regular' as const };
  if (kind === 'order') return <ShoppingBagIcon {...props} />;
  if (kind === 'fulfillment') return <TruckIcon {...props} />;
  if (kind === 'payment') return <CreditCardIcon {...props} />;
  return <PackageIcon {...props} />;
}
