import NextLink from 'next/link';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { StatusChip } from '@/components/ui';
import styles from './catalog-voucher.module.css';

export type CatalogVoucherStatus =
  'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'RESERVED' | 'CONSUMED' | 'RELEASED';

const STATUS_PRESENTATION = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
  PAUSED: { label: 'Tạm dừng', tone: 'warning' },
  ARCHIVED: { label: 'Đã lưu trữ', tone: 'neutral' },
  RESERVED: { label: 'Đang giữ lượt', tone: 'info' },
  CONSUMED: { label: 'Đã sử dụng', tone: 'success' },
  RELEASED: { label: 'Đã giải phóng', tone: 'neutral' },
} as const;

export function CatalogVoucherStatusChip({
  label,
  status,
}: Readonly<{ label?: string; status: CatalogVoucherStatus }>) {
  const presentation = STATUS_PRESENTATION[status];
  return <StatusChip label={label ?? presentation.label} tone={presentation.tone} />;
}

export interface BackofficeFilterToolbarProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  'children'
> {
  readonly actions: ReactNode;
  readonly children: ReactNode;
  readonly label?: string;
  readonly summary?: ReactNode;
}

export function BackofficeFilterToolbar({
  actions,
  children,
  className,
  label = 'Bộ lọc',
  summary,
  ...props
}: BackofficeFilterToolbarProps) {
  return (
    <form
      {...props}
      aria-label={label}
      className={[styles.filterToolbar, className].filter(Boolean).join(' ')}
    >
      <div className={styles.filterFields}>{children}</div>
      <div className={styles.filterFooter}>
        {summary ? <div className={styles.filterSummary}>{summary}</div> : <span />}
        <div className={styles.filterActions}>{actions}</div>
      </div>
    </form>
  );
}

export interface BackofficeDataColumn<T> {
  readonly align?: 'start' | 'end';
  readonly key: string;
  readonly label: string;
  readonly mobileRole?: 'primary' | 'default' | 'action';
  readonly render: (row: T) => ReactNode;
}

export interface BackofficeDataBoardProps<T> {
  readonly ariaLabel: string;
  readonly columns: readonly BackofficeDataColumn<T>[];
  readonly emptyDescription?: ReactNode;
  readonly emptyTitle?: string;
  readonly getRowKey: (row: T) => string;
  readonly loading?: boolean;
  readonly rows: readonly T[];
}

export function BackofficeDataBoard<T>({
  ariaLabel,
  columns,
  emptyDescription = 'Hãy thay đổi bộ lọc hoặc tạo bản ghi mới.',
  emptyTitle = 'Chưa có dữ liệu phù hợp',
  getRowKey,
  loading = false,
  rows,
}: BackofficeDataBoardProps<T>) {
  if (!loading && rows.length === 0) {
    return (
      <section className={styles.emptyBoard} aria-label={ariaLabel}>
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
      </section>
    );
  }

  return (
    <div
      className={styles.dataBoard}
      role="region"
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      tabIndex={0}
    >
      <table>
        <caption className="rp-visually-hidden">{ariaLabel}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th data-align={column.align ?? 'start'} key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td
                  data-align={column.align ?? 'start'}
                  data-label={column.label}
                  data-mobile-role={column.mobileRole ?? 'default'}
                  key={column.key}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading ? <p className={styles.loadingLabel}>Đang cập nhật dữ liệu…</p> : null}
    </div>
  );
}

type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

export interface BackofficePaginationProps {
  readonly buildHref: (page: number) => string;
  readonly page: number;
  readonly pageSize?: number;
  readonly totalItems?: number;
  readonly totalPages: number;
}

export function BackofficePagination({
  buildHref,
  page,
  pageSize,
  totalItems,
  totalPages,
}: BackofficePaginationProps) {
  if (totalPages <= 1) return null;

  const currentPage = Math.min(Math.max(1, page), totalPages);
  const items = paginationItems(currentPage, totalPages);
  const resultSummary = paginationResultSummary(currentPage, pageSize, totalItems);

  return (
    <nav className={styles.pagination} aria-label="Phân trang dữ liệu">
      <div className={styles.paginationSummary} aria-live="polite">
        {resultSummary ?? `Trang ${String(currentPage)} trên ${String(totalPages)}`}
      </div>
      <div className={styles.paginationControls}>
        {currentPage > 1 ? (
          <NextLink href={buildHref(currentPage - 1)} rel="prev">
            Trước
          </NextLink>
        ) : (
          <span aria-disabled="true">Trước</span>
        )}
        {items.map((item) =>
          typeof item === 'number' ? (
            <NextLink
              aria-current={item === currentPage ? 'page' : undefined}
              aria-label={`Trang ${String(item)}`}
              href={buildHref(item)}
              key={item}
            >
              {String(item)}
            </NextLink>
          ) : (
            <span aria-hidden="true" className={styles.paginationEllipsis} key={item}>
              …
            </span>
          ),
        )}
        {currentPage < totalPages ? (
          <NextLink href={buildHref(currentPage + 1)} rel="next">
            Sau
          </NextLink>
        ) : (
          <span aria-disabled="true">Sau</span>
        )}
      </div>
    </nav>
  );
}

export function paginationItems(page: number, totalPages: number): readonly PaginationItem[] {
  if (totalPages <= 7)
    return Array.from({ length: Math.max(0, totalPages) }, (_, index) => index + 1);

  const middle = [page - 1, page, page + 1].filter((item) => item > 1 && item < totalPages);
  const items: PaginationItem[] = [1];
  if (middle[0] !== 2) items.push('ellipsis-start');
  items.push(...middle);
  if (middle.at(-1) !== totalPages - 1) items.push('ellipsis-end');
  items.push(totalPages);
  return items;
}

function paginationResultSummary(
  page: number,
  pageSize?: number,
  totalItems?: number,
): string | undefined {
  if (pageSize === undefined || totalItems === undefined || totalItems < 0) return undefined;
  if (totalItems === 0) return 'Không có kết quả';
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  return `${String(first)}–${String(last)} trên ${String(totalItems)} kết quả`;
}
