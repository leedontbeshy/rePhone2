'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { InventoryShell } from '@/components/backoffice';
import { InventoryStockMovementsView } from '@/components/backoffice/inventory/stock/inventory-stock-movements-view';
import type { StockVariantOption } from '@/components/backoffice/inventory/stock/inventory-stock-view';
import {
  buildStockMovementHref,
  isCurrentStockRequest,
  mergeStockMovementQuery,
  sortStockVariantOptions,
  stockMovementQueryFromSearch,
  stockPageWithinTotal,
  type StockMovementQueryOverrides,
  type StockMovementQueryState,
} from '@/components/backoffice/inventory/stock/stock-model';
import {
  listInventoryLocations,
  listInventoryStockLevels,
  listInventoryStockMovements,
  type InventoryLocation,
  type InventoryStockLevel,
  type InventoryStockMovement,
} from '@/lib/backoffice-inventory-api';

const EMPTY_PAGINATION = { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 };

export default function InventoryStockMovementsPage() {
  const { client, status, user } = useAuth();
  const canLoad =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');
  const [query, setQuery] = useState<StockMovementQueryState>(() => currentQuery());
  const queryRef = useRef(query);
  const [movements, setMovements] = useState<readonly InventoryStockMovement[]>([]);
  const [locations, setLocations] = useState<readonly InventoryLocation[]>([]);
  const [variants, setVariants] = useState<readonly StockVariantOption[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const movementRequestRef = useRef(0);
  const optionRequestRef = useRef(0);

  useEffect(() => {
    const syncFromBrowser = () => {
      const next = currentQuery();
      queryRef.current = next;
      setQuery(next);
    };
    window.addEventListener('popstate', syncFromBrowser);
    return () => {
      window.removeEventListener('popstate', syncFromBrowser);
    };
  }, []);

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    const request = ++optionRequestRef.current;
    void Promise.all([
      listInventoryLocations(client, { signal: controller.signal }),
      listInventoryStockLevels(client, { page: 1, pageSize: 100 }, { signal: controller.signal }),
    ])
      .then(([nextLocations, levelPage]) => {
        if (!isCurrentStockRequest(request, optionRequestRef.current, controller.signal)) return;
        setLocations(nextLocations);
        setVariants((current) => mergeVariantOptions(current, variantOptions(levelPage.data)));
      })
      .catch((cause: unknown) => {
        if (isCurrentStockRequest(request, optionRequestRef.current, controller.signal)) {
          setError(messageOf(cause, 'Không thể tải lựa chọn lọc lịch sử.'));
        }
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, client]);

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    const request = ++movementRequestRef.current;
    setLoading(true);
    setError(null);
    void listInventoryStockMovements(
      client,
      {
        page: query.page,
        pageSize: query.pageSize,
        ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
        ...(query.locationId === undefined ? {} : { locationId: query.locationId }),
        ...(query.type === undefined ? {} : { type: query.type }),
        ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
        ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
        ...(query.referenceType === undefined ? {} : { referenceType: query.referenceType }),
        ...(query.referenceId === undefined ? {} : { referenceId: query.referenceId }),
      },
      { signal: controller.signal },
    )
      .then((page) => {
        if (!isCurrentStockRequest(request, movementRequestRef.current, controller.signal)) return;

        const authoritativePage = stockPageWithinTotal(query.page, page.pagination.totalPages);
        if (authoritativePage !== query.page) {
          const next = mergeStockMovementQuery(query, { page: authoritativePage });
          queryRef.current = next;
          setQuery(next);
          window.history.replaceState(null, '', buildStockMovementHref(next));
          return;
        }

        setMovements(page.data);
        setPagination(page.pagination);
        setVariants((current) => mergeVariantOptions(current, movementVariantOptions(page.data)));
      })
      .catch((cause: unknown) => {
        if (isCurrentStockRequest(request, movementRequestRef.current, controller.signal)) {
          setError(messageOf(cause, 'Không thể tải lịch sử kho.'));
        }
      })
      .finally(() => {
        if (isCurrentStockRequest(request, movementRequestRef.current, controller.signal)) {
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, client, query]);

  const updateQuery = useCallback(
    (overrides: StockMovementQueryOverrides, options: { history?: 'push' | 'replace' } = {}) => {
      const next = mergeStockMovementQuery(queryRef.current, overrides);
      queryRef.current = next;
      setQuery(next);
      const href = buildStockMovementHref(next);
      if (options.history === 'replace') window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
    },
    [],
  );

  return (
    <InventoryShell breadcrumbs={[{ label: 'Kho hàng' }, { label: 'Lịch sử kho' }]}>
      <InventoryStockMovementsView
        error={error}
        loading={loading}
        locations={locations}
        movements={movements}
        pagination={pagination}
        query={query}
        variants={variants}
        onQueryChange={updateQuery}
      />
    </InventoryShell>
  );
}

function currentQuery(): StockMovementQueryState {
  if (typeof window === 'undefined') return { page: 1, pageSize: 20 };
  return stockMovementQueryFromSearch(new URLSearchParams(window.location.search));
}

function variantOptions(levels: readonly InventoryStockLevel[]): StockVariantOption[] {
  const seen = new Set<string>();
  return levels.flatMap((level) => {
    if (seen.has(level.variant.id)) return [];
    seen.add(level.variant.id);
    return [{ ...level.variant, productName: level.product?.name ?? 'Phụ kiện' }];
  });
}

function movementVariantOptions(
  movements: readonly InventoryStockMovement[],
): StockVariantOption[] {
  return movements.flatMap((movement) =>
    movement.variant === null
      ? []
      : [
          {
            ...movement.variant,
            productName: movement.product?.name ?? 'Phụ kiện',
          },
        ],
  );
}

function mergeVariantOptions(
  current: readonly StockVariantOption[],
  incoming: readonly StockVariantOption[],
): StockVariantOption[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return sortStockVariantOptions([...byId.values()]);
}

function messageOf(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
