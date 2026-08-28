import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, InlineAlert, Skeleton } from '@/components/ui';
import styles from './shared.module.css';

export type PostPurchaseTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function PostPurchasePageHeader({
  action,
  description,
  status,
  title,
}: Readonly<{
  action?: ReactNode | undefined;
  description?: ReactNode | undefined;
  status?: ReactNode | undefined;
  title: ReactNode;
}>) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {status || action ? (
        <div className={styles.pageHeaderAside}>
          {status}
          {action}
        </div>
      ) : null}
    </header>
  );
}

export function StatusPill({
  children,
  tone = 'neutral',
}: Readonly<{ children: ReactNode; tone?: PostPurchaseTone }>) {
  return (
    <span className={styles.statusPill} data-tone={tone}>
      {children}
    </span>
  );
}

export function CollectionSurface({
  ariaLabel,
  children,
  footer,
}: Readonly<{ ariaLabel: string; children: ReactNode; footer?: ReactNode | undefined }>) {
  return (
    <section className={styles.collection} aria-label={ariaLabel}>
      <div>{children}</div>
      {footer ? <footer className={styles.collectionFooter}>{footer}</footer> : null}
    </section>
  );
}

export function DetailPanel({
  children,
  className,
  title,
}: Readonly<{
  children: ReactNode;
  className?: string | undefined;
  title?: ReactNode | undefined;
}>) {
  return (
    <section className={[styles.detailPanel, className].filter(Boolean).join(' ')}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function DetailGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.detailGrid}>{children}</div>;
}

export function ProductTextSummary({
  icon,
  name,
  secondary,
}: Readonly<{ icon?: ReactNode | undefined; name: string; secondary?: ReactNode | undefined }>) {
  return (
    <div className={styles.productSummary}>
      {icon ? (
        <span className={styles.productGlyph} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>
        <strong>{name}</strong>
        {secondary ? <small>{secondary}</small> : null}
      </span>
    </div>
  );
}

export function CollectionLoading({ label = 'Đang tải thông tin…' }: Readonly<{ label?: string }>) {
  return (
    <div className={styles.loading} role="status" aria-label={label}>
      <Skeleton height="4.5rem" />
      <Skeleton height="4.5rem" />
      <Skeleton height="4.5rem" />
      <span className="rp-visually-hidden">{label}</span>
    </div>
  );
}

export function EmptyState({
  actionHref,
  actionLabel,
  description,
  title,
}: Readonly<{ actionHref?: string; actionLabel?: string; description: ReactNode; title: string }>) {
  return (
    <section className={styles.statePanel}>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionHref && actionLabel ? (
        <Link className={styles.stateLink} href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

export function ErrorState({
  message,
  onRetry,
}: Readonly<{ message: string; onRetry?: (() => void) | undefined }>) {
  return (
    <InlineAlert tone="danger" title="Chưa thể tải thông tin">
      <p>{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} variant="secondary">
          Thử lại
        </Button>
      ) : null}
    </InlineAlert>
  );
}

export function SafeNotFoundState({
  description = 'Hãy mở đúng liên kết đã nhận hoặc đăng nhập tài khoản đã sử dụng để mua hàng.',
  title = 'Không mở được thông tin này',
}: Readonly<{ description?: string; title?: string }>) {
  return (
    <EmptyState actionHref="/" actionLabel="Về trang chủ" description={description} title={title} />
  );
}

export function Pagination({
  buildHref,
  page,
  totalPages,
}: Readonly<{ buildHref: (page: number) => string; page: number; totalPages: number }>) {
  if (totalPages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label="Phân trang">
      {page > 1 ? (
        <Link href={buildHref(page - 1)}>Trước</Link>
      ) : (
        <span aria-disabled="true">Trước</span>
      )}
      <span aria-current="page">
        Trang {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={buildHref(page + 1)}>Sau</Link>
      ) : (
        <span aria-disabled="true">Sau</span>
      )}
    </nav>
  );
}
