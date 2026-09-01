'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { InventoryShell } from '@/components/backoffice';
import {
  InventoryUnitListView,
  buildInventoryUnitHref,
  clampInventoryUnitPage,
  looksLikeProtectedIdentifier,
  type InventoryUnitListRecord,
  type InventoryUnitQueryOverrides,
  type InventoryUnitQueryState,
} from '@/components/backoffice/inventory/units/inventory-unit-list-view';
import {
  listInventoryLocations,
  listInventoryUnits,
  type InventoryLocation,
  type InventoryUnitListItem,
} from '@/lib/backoffice-inventory-api';

const DEFAULT_QUERY: InventoryUnitQueryState = {
  page: 1,
  pageSize: 20,
  sortBy: 'receivedAt',
  sortOrder: 'desc',
};

export default function InventoryUnitsPage() {
  const { client, status, user } = useAuth();
  const canLoad =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');
  const [query, setQuery] = useState<InventoryUnitQueryState>(() => currentQuery());
  const queryRef = useRef(query);
  const [units, setUnits] = useState<readonly InventoryUnitListRecord[]>([]);
  const [locations, setLocations] = useState<readonly InventoryLocation[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    const syncFromBrowser = () => {
      const next = currentQuery();
      queryRef.current = next;
      setQuery(next);
    };
    syncFromBrowser();
    window.addEventListener('popstate', syncFromBrowser);
    return () => {
      window.removeEventListener('popstate', syncFromBrowser);
    };
  }, []);

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    void listInventoryLocations(client, { signal: controller.signal })
      .then(setLocations)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(messageOf(cause, 'Không thể tải danh sách địa điểm.'));
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, client]);

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listInventoryUnits(
      client,
      {
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        ...(query.q === undefined ? {} : { q: query.q }),
        ...(query.locationId === undefined ? {} : { locationId: query.locationId }),
        ...(query.lifecycleStatus === undefined ? {} : { lifecycleStatus: query.lifecycleStatus }),
        ...(query.conditionGrade === undefined ? {} : { conditionGrade: query.conditionGrade }),
        ...(query.simLockStatus === undefined ? {} : { simLockStatus: query.simLockStatus }),
        ...(query.minBatteryHealth === undefined
          ? {}
          : { minBatteryHealth: query.minBatteryHealth }),
      },
      { signal: controller.signal },
    )
      .then((page) => {
        const clampedPage = clampInventoryUnitPage(query.page, page.pagination.totalPages);
        if (clampedPage !== query.page) {
          const next = mergeQuery(queryRef.current, { page: clampedPage });
          queryRef.current = next;
          setQuery(next);
          window.history.replaceState(null, '', buildInventoryUnitHref(next));
          return;
        }
        setUnits(page.data.map(toViewRecord));
        setPagination(page.pagination);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(cause, 'Không thể tải danh sách máy.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, client, queryKey]);

  const updateQuery = useCallback(
    (overrides: InventoryUnitQueryOverrides, options: { history?: 'push' | 'replace' } = {}) => {
      const next = mergeQuery(queryRef.current, overrides);
      queryRef.current = next;
      setQuery(next);
      const href = buildInventoryUnitHref(next);
      if (options.history === 'replace') window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
    },
    [],
  );

  return (
    <InventoryShell breadcrumbs={[{ label: 'Kho hàng' }, { label: 'Máy vật lý' }]}>
      <InventoryUnitListView
        error={error}
        loading={loading}
        locations={locations.map((location) => ({ id: location.id, name: location.name }))}
        pagination={pagination}
        query={query}
        units={units}
        onQueryChange={updateQuery}
      />
    </InventoryShell>
  );
}

function currentQuery(): InventoryUnitQueryState {
  if (typeof window === 'undefined') return DEFAULT_QUERY;
  const params = new URLSearchParams(window.location.search);
  const lifecycleStatus = enumValue(params.get('lifecycleStatus'), [
    'RECEIVED',
    'INSPECTING',
    'AVAILABLE',
    'IN_TRANSIT',
    'SOLD',
    'REPAIRING',
    'QUARANTINED',
    'WRITTEN_OFF',
  ] as const);
  const conditionGrade = enumValue(params.get('conditionGrade'), ['A', 'B', 'C'] as const);
  const simLockStatus = enumValue(params.get('simLockStatus'), [
    'UNLOCKED',
    'CARRIER_LOCKED',
    'UNKNOWN',
  ] as const);
  const sortBy = enumValue(params.get('sortBy'), [
    'receivedAt',
    'updatedAt',
    'inventoryCode',
    'salePrice',
  ] as const);
  const sortOrder = enumValue(params.get('sortOrder'), ['asc', 'desc'] as const);
  const page = positiveInteger(params.get('page'), 1);
  const pageSize = Math.min(100, positiveInteger(params.get('pageSize'), 20));
  const minBatteryHealth = optionalInteger(params.get('minBatteryHealth'), 0, 100);
  const rawQuery = trimmed(params.get('q'));
  const q = rawQuery === undefined || looksLikeProtectedIdentifier(rawQuery) ? undefined : rawQuery;
  const locationId = trimmed(params.get('locationId'));
  return {
    page,
    pageSize,
    sortBy: sortBy ?? 'receivedAt',
    sortOrder: sortOrder ?? 'desc',
    ...(q === undefined ? {} : { q }),
    ...(locationId === undefined ? {} : { locationId }),
    ...(lifecycleStatus === undefined ? {} : { lifecycleStatus }),
    ...(conditionGrade === undefined ? {} : { conditionGrade }),
    ...(simLockStatus === undefined ? {} : { simLockStatus }),
    ...(minBatteryHealth === undefined ? {} : { minBatteryHealth }),
  };
}

function mergeQuery(
  current: InventoryUnitQueryState,
  overrides: InventoryUnitQueryOverrides,
): InventoryUnitQueryState {
  const next = { ...current, ...overrides };
  return {
    page: next.page ?? 1,
    pageSize: next.pageSize ?? 20,
    sortBy: next.sortBy ?? 'receivedAt',
    sortOrder: next.sortOrder ?? 'desc',
    ...(next.q === undefined ? {} : { q: next.q }),
    ...(next.locationId === undefined ? {} : { locationId: next.locationId }),
    ...(next.lifecycleStatus === undefined ? {} : { lifecycleStatus: next.lifecycleStatus }),
    ...(next.conditionGrade === undefined ? {} : { conditionGrade: next.conditionGrade }),
    ...(next.simLockStatus === undefined ? {} : { simLockStatus: next.simLockStatus }),
    ...(next.minBatteryHealth === undefined ? {} : { minBatteryHealth: next.minBatteryHealth }),
  };
}

function toViewRecord(unit: InventoryUnitListItem): InventoryUnitListRecord {
  return {
    activeReservationCount: unit.activeReservationCount,
    batteryHealthPercent: unit.currentInspection?.batteryHealthPercent ?? null,
    conditionGrade: unit.currentInspection?.conditionGrade ?? null,
    id: unit.id,
    inspectionResult: unit.currentInspection?.overallResult ?? null,
    inventoryCode: unit.inventoryCode,
    lifecycleStatus: unit.lifecycleStatus,
    locationName: unit.location.name,
    maskedIdentifierSummary:
      unit.maskedIdentifiers.map((item) => item.maskedValue).join(' · ') || 'Chưa có',
    mediaCount: unit.mediaCount,
    productName: unit.product.name,
    receivedAt: unit.receivedAt,
    salePrice: unit.salePrice,
    variantName: unit.variant.displayName,
  };
}

function enumValue<const Values extends readonly string[]>(
  value: string | null,
  values: Values,
): Values[number] | undefined {
  return values.find((candidate) => candidate === value);
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalInteger(value: string | null, min: number, max: number): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function trimmed(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function messageOf(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
