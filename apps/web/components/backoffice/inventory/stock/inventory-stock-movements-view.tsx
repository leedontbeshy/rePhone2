'use client';

import { ArrowLeftIcon, LockSimpleIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import {
  BackofficeDataBoard,
  BackofficePagination,
  stockMovementLabel,
  type BackofficeDataColumn,
  type InventoryStockMovementType,
} from '@/components/backoffice';
import { Input, Select, StatusChip } from '@/components/ui';
import type { InventoryLocation, InventoryStockMovement } from '@/lib/backoffice-inventory-api';
import type { StockVariantOption } from './inventory-stock-view';
import {
  buildStockMovementHref,
  type StockMovementQueryOverrides,
  type StockMovementQueryState,
} from './stock-model';
import boardStyles from '../inventory-data-board.module.css';
import styles from './inventory-stock.module.css';

export interface InventoryStockMovementsViewProps {
  readonly error?: string | null;
  readonly loading?: boolean;
  readonly locations: readonly InventoryLocation[];
  readonly movements: readonly InventoryStockMovement[];
  readonly onQueryChange: (
    overrides: StockMovementQueryOverrides,
    options?: { history?: 'push' | 'replace' },
  ) => void;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
  readonly query: StockMovementQueryState;
  readonly variants: readonly StockVariantOption[];
}

const MOVEMENT_TYPES: readonly InventoryStockMovementType[] = [
  'RECEIPT',
  'SALE',
  'RETURN',
  'TRANSFER',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'WRITE_OFF',
];

export function InventoryStockMovementsView({
  error = null,
  loading = false,
  locations,
  movements,
  onQueryChange,
  pagination,
  query,
  variants,
}: InventoryStockMovementsViewProps) {
  const [referenceId, setReferenceId] = useState(query.referenceId ?? '');

  useEffect(() => {
    setReferenceId(query.referenceId ?? '');
  }, [query.referenceId]);

  useEffect(() => {
    if (referenceId.trim() === (query.referenceId ?? '')) return;
    const timer = window.setTimeout(() => {
      onQueryChange(
        { page: 1, referenceId: referenceId.trim() || undefined },
        { history: 'replace' },
      );
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onQueryChange, query.referenceId, referenceId]);

  const columns: readonly BackofficeDataColumn<InventoryStockMovement>[] = [
    {
      key: 'time',
      label: 'Thời gian',
      render: (movement) => (
        <time dateTime={movement.createdAt}>{formatDateTime(movement.createdAt)}</time>
      ),
    },
    {
      key: 'item',
      label: 'Phụ kiện',
      mobileRole: 'primary',
      render: (movement) => (
        <div className={styles.identity}>
          <strong>{movement.product?.name ?? 'Phụ kiện'}</strong>
          <span>{movement.variant?.displayName ?? 'Chưa có tên cấu hình'}</span>
          {movement.variant?.sku ? <small>{movement.variant.sku}</small> : null}
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Nghiệp vụ',
      render: (movement) => <MovementChip type={movement.type} />,
    },
    {
      key: 'route',
      label: 'Luồng hàng',
      render: (movement) => movementRoute(movement),
    },
    {
      align: 'end',
      key: 'quantity',
      label: 'Số lượng',
      render: (movement) => (
        <strong className={quantityClass(movement.type)}>{quantityLabel(movement)}</strong>
      ),
    },
    {
      key: 'reason',
      label: 'Lý do',
      render: (movement) => movement.reason ?? 'Theo nghiệp vụ hệ thống',
    },
    {
      key: 'source',
      label: 'Ghi nhận bởi',
      render: (movement) => (
        <div className={styles.movementSource}>
          <span>{movement.createdBy?.fullName ?? 'Hệ thống'}</span>
          {movement.referenceType ? (
            <small>{referenceTypeLabel(movement.referenceType)}</small>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Kho hàng · Sổ đối soát</p>
          <h1>Lịch sử kho</h1>
          <p>Đối chiếu mọi lần nhập, xuất, chuyển, điều chỉnh và hoàn phụ kiện.</p>
        </div>
        <Link className={styles.secondaryAction} href="/backoffice/inventory/stock">
          <ArrowLeftIcon aria-hidden="true" size={19} />
          Về tồn phụ kiện
        </Link>
      </header>

      <section className={styles.immutableNotice}>
        <LockSimpleIcon aria-hidden="true" size={24} weight="duotone" />
        <div>
          <strong>Lịch sử chỉ được ghi thêm</strong>
          <span>Bản ghi đã tạo không thể sửa hoặc xóa, giúp số liệu luôn đối soát được.</span>
        </div>
      </section>

      <section className={styles.movementFilters} aria-label="Bộ lọc lịch sử kho">
        <Select
          id="movement-type-filter"
          label="Nghiệp vụ"
          value={query.type ?? ''}
          onChange={(event) => {
            onQueryChange({
              page: 1,
              type:
                event.target.value === ''
                  ? undefined
                  : (event.target.value as InventoryStockMovementType),
            });
          }}
        >
          <option value="">Tất cả nghiệp vụ</option>
          {MOVEMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {stockMovementLabel(type)}
            </option>
          ))}
        </Select>
        <Select
          id="movement-location-filter"
          label="Địa điểm liên quan"
          value={query.locationId ?? ''}
          onChange={(event) => {
            onQueryChange({ locationId: event.target.value || undefined, page: 1 });
          }}
        >
          <option value="">Tất cả địa điểm</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </Select>
        <Select
          id="movement-variant-filter"
          label="Phụ kiện"
          value={query.variantId ?? ''}
          onChange={(event) => {
            onQueryChange({ page: 1, variantId: event.target.value || undefined });
          }}
        >
          <option value="">Tất cả phụ kiện</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.productName} · {variant.displayName}
            </option>
          ))}
        </Select>
        <Input
          id="movement-date-from"
          label="Từ ngày"
          type="date"
          value={query.dateFrom ?? ''}
          onChange={(event) => {
            onQueryChange({ dateFrom: event.target.value || undefined, page: 1 });
          }}
        />
        <Input
          id="movement-date-to"
          label="Đến ngày"
          type="date"
          value={query.dateTo ?? ''}
          onChange={(event) => {
            onQueryChange({ dateTo: event.target.value || undefined, page: 1 });
          }}
        />
        <Select
          id="movement-reference-type"
          label="Nguồn tham chiếu"
          value={query.referenceType ?? ''}
          onChange={(event) => {
            onQueryChange({ page: 1, referenceType: event.target.value || undefined });
          }}
        >
          <option value="">Tất cả nguồn</option>
          <option value="SHIPMENT">Đơn giao hàng</option>
          <option value="AFTER_SALES_REQUEST">Phiếu hỗ trợ sau mua</option>
          <option value="ORDER">Đơn hàng</option>
        </Select>
        <Input
          hint="Chỉ dùng khi cần đối chiếu một hồ sơ cụ thể."
          id="movement-reference-id"
          label="Mã tham chiếu"
          value={referenceId}
          onChange={(event) => {
            setReferenceId(event.target.value);
          }}
        />
      </section>

      {error === null ? null : (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <p className={styles.resultSummary} role="status">
        {loading && movements.length > 0
          ? 'Đang cập nhật lịch sử…'
          : `${String(pagination.totalItems)} bản ghi phù hợp`}
      </p>

      <div className={boardStyles.board}>
        <BackofficeDataBoard
          ariaLabel="Lịch sử thay đổi tồn phụ kiện"
          columns={columns}
          emptyDescription="Thay đổi khoảng ngày hoặc bộ lọc để tìm bản ghi khác."
          emptyTitle="Chưa có lịch sử phù hợp"
          getRowKey={(movement) => movement.id}
          loading={loading}
          rows={movements}
        />
      </div>

      <div
        onClick={(event) => {
          handlePaginationClick(event, onQueryChange);
        }}
      >
        <BackofficePagination
          buildHref={(page) => buildStockMovementHref(query, { page })}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
        />
      </div>
    </div>
  );
}

function MovementChip({ type }: Readonly<{ type: InventoryStockMovementType }>) {
  return <StatusChip label={stockMovementLabel(type)} tone={movementTone(type)} />;
}

function movementTone(type: InventoryStockMovementType): 'success' | 'danger' | 'info' | 'neutral' {
  if (type === 'RECEIPT' || type === 'RETURN' || type === 'ADJUSTMENT_IN') return 'success';
  if (type === 'ADJUSTMENT_OUT' || type === 'WRITE_OFF') return 'danger';
  if (type === 'TRANSFER') return 'info';
  return 'neutral';
}

function movementRoute(movement: InventoryStockMovement): string {
  const from = movement.fromLocation?.name;
  const to = movement.toLocation?.name;
  if (from && to) return `${from} → ${to}`;
  if (to) return `Nhập vào ${to}`;
  if (from) return `Xuất từ ${from}`;
  return 'Không đổi địa điểm';
}

function quantityLabel(movement: InventoryStockMovement): string {
  const quantity = new Intl.NumberFormat('vi-VN').format(movement.quantity);
  if (['RECEIPT', 'RETURN', 'ADJUSTMENT_IN'].includes(movement.type)) return `+${quantity}`;
  if (['SALE', 'ADJUSTMENT_OUT', 'WRITE_OFF'].includes(movement.type)) return `−${quantity}`;
  return quantity;
}

function quantityClass(type: InventoryStockMovementType): string {
  if (['RECEIPT', 'RETURN', 'ADJUSTMENT_IN'].includes(type)) return styles.quantityIn ?? '';
  if (['SALE', 'ADJUSTMENT_OUT', 'WRITE_OFF'].includes(type)) return styles.quantityOut ?? '';
  return styles.quantityTransfer ?? '';
}

function referenceTypeLabel(value: string): string {
  if (value === 'SHIPMENT') return 'Đơn giao hàng';
  if (value === 'AFTER_SALES_REQUEST') return 'Phiếu hỗ trợ sau mua';
  if (value === 'ORDER') return 'Đơn hàng';
  return 'Nghiệp vụ liên quan';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function handlePaginationClick(
  event: MouseEvent<HTMLDivElement>,
  onQueryChange: InventoryStockMovementsViewProps['onQueryChange'],
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
  const target = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (target === null) return;
  const page = Number(new URL(target.href).searchParams.get('page') ?? '1');
  if (!Number.isSafeInteger(page) || page < 1) return;
  event.preventDefault();
  onQueryChange({ page });
}
