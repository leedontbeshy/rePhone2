'use client';

import { MagnifyingGlassIcon, PlusIcon, ScanIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import {
  BackofficeDataBoard,
  BackofficePagination,
  inspectionResultLabel,
  inventoryLifecycleLabel,
  inventoryLifecyclePresentation,
  type BackofficeDataColumn,
  type InventoryLifecycleStatus,
} from '@/components/backoffice';
import { StatusChip, formatVnd } from '@/components/ui';
import styles from './inventory-units.module.css';

export interface InventoryUnitListRecord {
  readonly activeReservationCount: number;
  readonly batteryHealthPercent: number | null;
  readonly conditionGrade: 'A' | 'B' | 'C' | null;
  readonly id: string;
  readonly inspectionResult: 'INCOMPLETE' | 'PASSED' | 'PARTIAL' | 'FAILED' | null;
  readonly inventoryCode: string;
  readonly lifecycleStatus: InventoryLifecycleStatus;
  readonly locationName: string;
  readonly maskedIdentifierSummary: string;
  readonly mediaCount: number;
  readonly productName: string;
  readonly receivedAt: string;
  readonly salePrice: string | null;
  readonly variantName: string;
}

export interface InventoryUnitLocationOption {
  readonly id: string;
  readonly name: string;
}

export interface InventoryUnitQueryState {
  readonly conditionGrade?: 'A' | 'B' | 'C';
  readonly lifecycleStatus?: InventoryLifecycleStatus;
  readonly locationId?: string;
  readonly minBatteryHealth?: number;
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly simLockStatus?: 'UNLOCKED' | 'CARRIER_LOCKED' | 'UNKNOWN';
  readonly sortBy: 'receivedAt' | 'updatedAt' | 'inventoryCode' | 'salePrice';
  readonly sortOrder: 'asc' | 'desc';
}

export type InventoryUnitQueryOverrides = {
  readonly [Key in keyof InventoryUnitQueryState]?: InventoryUnitQueryState[Key] | undefined;
};

export interface InventoryUnitPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface InventoryUnitListViewProps {
  readonly error?: string | null;
  readonly loading?: boolean;
  readonly locations: readonly InventoryUnitLocationOption[];
  readonly onQueryChange?: (
    overrides: InventoryUnitQueryOverrides,
    options?: { history?: 'push' | 'replace' },
  ) => void;
  readonly pagination: InventoryUnitPagination;
  readonly query: InventoryUnitQueryState;
  readonly units: readonly InventoryUnitListRecord[];
}

const STATUS_OPTIONS: readonly InventoryLifecycleStatus[] = [
  'RECEIVED',
  'INSPECTING',
  'AVAILABLE',
  'IN_TRANSIT',
  'SOLD',
  'REPAIRING',
  'QUARANTINED',
  'WRITTEN_OFF',
];

export function InventoryUnitListView({
  error = null,
  loading = false,
  locations,
  onQueryChange,
  pagination,
  query,
  units,
}: InventoryUnitListViewProps) {
  const [search, setSearch] = useState(query.q ?? '');
  const protectedSearch = looksLikeProtectedIdentifier(search);

  useEffect(() => {
    setSearch(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    if (onQueryChange === undefined || protectedSearch || search.trim() === (query.q ?? '')) return;
    const timer = window.setTimeout(() => {
      onQueryChange(
        { page: 1, q: search.trim() === '' ? undefined : search.trim() },
        { history: 'replace' },
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onQueryChange, protectedSearch, query.q, search]);

  const columns: readonly BackofficeDataColumn<InventoryUnitListRecord>[] = [
    {
      key: 'unit',
      label: 'Máy',
      mobileRole: 'primary',
      render: (unit) => (
        <div className={styles.unitIdentity}>
          <Link href={`/backoffice/inventory/units/${unit.id}`}>{unit.productName}</Link>
          <span>{unit.variantName}</span>
          <small>{unit.inventoryCode}</small>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (unit) => <InventoryLifecycleChip status={unit.lifecycleStatus} />,
    },
    {
      key: 'location',
      label: 'Địa điểm',
      render: (unit) => unit.locationName,
    },
    {
      key: 'inspection',
      label: 'Kiểm định',
      render: (unit) => <InspectionSummary unit={unit} />,
    },
    {
      align: 'end',
      key: 'price',
      label: 'Giá bán',
      render: (unit) => (unit.salePrice === null ? 'Chưa đặt' : formatVnd(unit.salePrice)),
    },
    {
      align: 'end',
      key: 'received',
      label: 'Ngày nhận',
      render: (unit) => formatInventoryDate(unit.receivedAt),
    },
    {
      align: 'end',
      key: 'action',
      label: '',
      mobileRole: 'action',
      render: (unit) => (
        <Link className={styles.detailLink} href={`/backoffice/inventory/units/${unit.id}`}>
          Xem hồ sơ
        </Link>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Kho hàng · Máy vật lý</p>
          <h1>Danh sách máy</h1>
          <p>Theo dõi từng chiếc iPhone từ khi tiếp nhận đến khi bán hoặc xử lý nội bộ.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryAction} href="/backoffice/inventory/lookup">
            <ScanIcon aria-hidden="true" size={18} />
            Tra cứu mã máy
          </Link>
          <Link className={styles.primaryAction} href="/backoffice/inventory/intake">
            <PlusIcon aria-hidden="true" size={18} weight="bold" />
            Nhập máy
          </Link>
        </div>
      </header>

      {error === null ? null : (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <section className={styles.filters} aria-label="Bộ lọc máy vật lý">
        <div className={styles.searchGroup}>
          <label className={styles.searchField}>
            <span className="rp-visually-hidden">Tìm máy</span>
            <MagnifyingGlassIcon aria-hidden="true" size={20} />
            <input
              placeholder="Tên máy, cấu hình hoặc mã kho"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </label>
          {protectedSearch ? (
            <span className={styles.searchPrivacyWarning} role="alert">
              IMEI, EID và số sê-ri chỉ được nhập tại{' '}
              <Link href="/backoffice/inventory/lookup">trang tra cứu mã máy</Link>.
            </span>
          ) : null}
        </div>
        <select
          aria-label="Trạng thái máy"
          value={query.lifecycleStatus ?? ''}
          onChange={(event) => {
            onQueryChange?.({
              lifecycleStatus:
                event.target.value === ''
                  ? undefined
                  : (event.target.value as InventoryLifecycleStatus),
              page: 1,
            });
          }}
        >
          <option value="">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {inventoryLifecycleLabel(status)}
            </option>
          ))}
        </select>
        <select
          aria-label="Địa điểm"
          value={query.locationId ?? ''}
          onChange={(event) => {
            onQueryChange?.({ locationId: event.target.value || undefined, page: 1 });
          }}
        >
          <option value="">Tất cả địa điểm</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Tình trạng ngoại hình"
          value={query.conditionGrade ?? ''}
          onChange={(event) => {
            onQueryChange?.({
              conditionGrade:
                event.target.value === '' ? undefined : (event.target.value as 'A' | 'B' | 'C'),
              page: 1,
            });
          }}
        >
          <option value="">Mọi ngoại hình</option>
          <option value="A">Loại A</option>
          <option value="B">Loại B</option>
          <option value="C">Loại C</option>
        </select>
        <select
          aria-label="Tình trạng khóa mạng"
          value={query.simLockStatus ?? ''}
          onChange={(event) => {
            onQueryChange?.({
              page: 1,
              simLockStatus:
                event.target.value === ''
                  ? undefined
                  : (event.target.value as InventoryUnitQueryState['simLockStatus']),
            });
          }}
        >
          <option value="">Mọi tình trạng mạng</option>
          <option value="UNLOCKED">Không khóa mạng</option>
          <option value="CARRIER_LOCKED">Khóa theo nhà mạng</option>
          <option value="UNKNOWN">Chưa xác định</option>
        </select>
        <select
          aria-label="Dung lượng pin tối thiểu"
          value={query.minBatteryHealth ?? ''}
          onChange={(event) => {
            onQueryChange?.({
              minBatteryHealth: event.target.value === '' ? undefined : Number(event.target.value),
              page: 1,
            });
          }}
        >
          <option value="">Mọi mức pin</option>
          <option value="80">Từ 80%</option>
          <option value="85">Từ 85%</option>
          <option value="90">Từ 90%</option>
          <option value="95">Từ 95%</option>
        </select>
        <select
          aria-label="Sắp xếp"
          value={`${query.sortBy}:${query.sortOrder}`}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split(':') as [
              InventoryUnitQueryState['sortBy'],
              InventoryUnitQueryState['sortOrder'],
            ];
            onQueryChange?.({ page: 1, sortBy, sortOrder });
          }}
        >
          <option value="receivedAt:desc">Mới nhận gần đây</option>
          <option value="updatedAt:desc">Mới cập nhật</option>
          <option value="inventoryCode:asc">Mã máy A–Z</option>
          <option value="salePrice:desc">Giá cao đến thấp</option>
          <option value="salePrice:asc">Giá thấp đến cao</option>
        </select>
      </section>

      <p className={styles.resultSummary} role="status">
        {loading && units.length > 0
          ? 'Đang cập nhật danh sách…'
          : `${String(pagination.totalItems)} máy phù hợp`}
      </p>

      <BackofficeDataBoard
        ariaLabel="Danh sách máy vật lý"
        columns={columns}
        emptyDescription="Thay đổi bộ lọc hoặc tiếp nhận một máy mới."
        emptyTitle="Chưa có máy phù hợp"
        getRowKey={(unit) => unit.id}
        loading={loading}
        rows={units}
      />

      <div
        onClick={(event) => {
          handlePaginationClick(event, onQueryChange);
        }}
      >
        <BackofficePagination
          buildHref={(page) => buildInventoryUnitHref(query, { page })}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
        />
      </div>
    </div>
  );
}

function InspectionSummary({ unit }: Readonly<{ unit: InventoryUnitListRecord }>) {
  if (unit.inspectionResult === null) return <span className={styles.muted}>Chưa kiểm định</span>;
  return (
    <div className={styles.inspectionSummary}>
      <strong>{inspectionResultLabel(unit.inspectionResult)}</strong>
      <span>
        {unit.conditionGrade === null ? 'Chưa xếp loại' : `Loại ${unit.conditionGrade}`}
        {unit.batteryHealthPercent === null ? '' : ` · Pin ${String(unit.batteryHealthPercent)}%`}
      </span>
    </div>
  );
}

export function buildInventoryUnitHref(
  query: InventoryUnitQueryState,
  overrides: InventoryUnitQueryOverrides = {},
): string {
  const next = { ...query, ...overrides };
  const page = next.page ?? query.page;
  const pageSize = next.pageSize ?? query.pageSize;
  const sortBy = next.sortBy ?? query.sortBy;
  const sortOrder = next.sortOrder ?? query.sortOrder;
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.lifecycleStatus) params.set('lifecycleStatus', next.lifecycleStatus);
  if (next.locationId) params.set('locationId', next.locationId);
  if (next.conditionGrade) params.set('conditionGrade', next.conditionGrade);
  if (next.simLockStatus) params.set('simLockStatus', next.simLockStatus);
  if (next.minBatteryHealth !== undefined)
    params.set('minBatteryHealth', String(next.minBatteryHealth));
  if (page > 1) params.set('page', String(page));
  if (pageSize !== 20) params.set('pageSize', String(pageSize));
  if (sortBy !== 'receivedAt') params.set('sortBy', sortBy);
  if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);
  const value = params.toString();
  return value === '' ? '/backoffice/inventory/units' : `/backoffice/inventory/units?${value}`;
}

export function looksLikeProtectedIdentifier(value: string): boolean {
  const trimmed = value.trim();
  const compact = trimmed.replace(/[.\s-]/g, '');
  if (/^\d{10,32}$/.test(compact)) return true;
  return (
    trimmed === trimmed.toUpperCase() &&
    /^[A-Z0-9]{8,20}$/.test(trimmed) &&
    /[A-Z]/.test(trimmed) &&
    /\d/.test(trimmed)
  );
}

function InventoryLifecycleChip({ status }: Readonly<{ status: InventoryLifecycleStatus }>) {
  const presentation = inventoryLifecyclePresentation(status);
  return <StatusChip label={presentation.label} tone={presentation.tone} />;
}

function formatInventoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(date);
}

function handlePaginationClick(
  event: MouseEvent<HTMLDivElement>,
  onQueryChange: InventoryUnitListViewProps['onQueryChange'],
) {
  if (onQueryChange === undefined || event.button !== 0 || event.metaKey || event.ctrlKey) return;
  const target = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (target === null) return;
  const page = Number(new URL(target.href).searchParams.get('page') ?? '1');
  if (!Number.isSafeInteger(page) || page < 1) return;
  event.preventDefault();
  onQueryChange({ page });
}
