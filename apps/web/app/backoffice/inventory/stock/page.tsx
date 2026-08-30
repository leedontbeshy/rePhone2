'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { InventoryShell } from '@/components/backoffice';
import {
  InventoryStockView,
  type StockCommandOutcome,
  type StockVariantOption,
} from '@/components/backoffice/inventory/stock/inventory-stock-view';
import {
  buildStockLevelHref,
  mergeStockLevelQuery,
  stockCommandErrorMessage,
  stockCommandErrorRequiresReconcile,
  stockLevelQueryFromSearch,
  type StockCommandRequest,
  type StockLevelQueryOverrides,
  type StockLevelQueryState,
} from '@/components/backoffice/inventory/stock/stock-model';
import {
  adjustInventoryStock,
  listInventoryLocations,
  listInventoryStockLevels,
  listInventoryStockMovements,
  receiveInventoryStock,
  returnInventoryStock,
  transferInventoryStock,
  type InventoryLocation,
  type InventoryStockLevel,
} from '@/lib/backoffice-inventory-api';

const EMPTY_PAGINATION = { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 };

export default function InventoryStockPage() {
  const { client, status, user } = useAuth();
  const canLoad =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');
  const [query, setQuery] = useState<StockLevelQueryState>(() => currentQuery());
  const queryRef = useRef(query);
  const [levels, setLevels] = useState<readonly InventoryStockLevel[]>([]);
  const [locations, setLocations] = useState<readonly InventoryLocation[]>([]);
  const [variants, setVariants] = useState<readonly StockVariantOption[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

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
    void Promise.all([
      listInventoryLocations(client, { signal: controller.signal }),
      listInventoryStockLevels(client, { page: 1, pageSize: 100 }, { signal: controller.signal }),
    ])
      .then(([nextLocations, optionPage]) => {
        setLocations(nextLocations);
        setVariants(variantOptions(optionPage.data));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(messageOf(cause, 'Không thể tải lựa chọn tồn kho.'));
        }
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, client]);

  const loadLevels = useCallback(
    async (signal?: AbortSignal) => {
      const page = await listInventoryStockLevels(
        client,
        {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
          ...(query.locationId === undefined ? {} : { locationId: query.locationId }),
          ...(query.lowStock === undefined ? {} : { lowStock: query.lowStock }),
        },
        signal === undefined ? {} : { signal },
      );
      setLevels(page.data);
      setPagination(page.pagination);
      setVariants((current) => mergeVariantOptions(current, variantOptions(page.data)));
    },
    [client, query],
  );

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadLevels(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(messageOf(cause, 'Không thể tải tồn phụ kiện.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, loadLevels, queryKey]);

  const updateQuery = useCallback((overrides: StockLevelQueryOverrides) => {
    const next = mergeStockLevelQuery(queryRef.current, overrides);
    queryRef.current = next;
    setQuery(next);
    window.history.pushState(null, '', buildStockLevelHref(next));
  }, []);

  const reconcile = useCallback(async () => {
    await Promise.all([
      loadLevels(),
      listInventoryStockMovements(client, { page: 1, pageSize: 1 }),
    ]);
  }, [client, loadLevels]);

  const executeCommand = useCallback(
    async (request: StockCommandRequest): Promise<StockCommandOutcome> => {
      setError(null);
      try {
        if (request.kind === 'receive') await receiveInventoryStock(client, request.input);
        else if (request.kind === 'transfer') await transferInventoryStock(client, request.input);
        else if (request.kind === 'adjust') await adjustInventoryStock(client, request.input);
        else await returnInventoryStock(client, request.input);
      } catch (cause: unknown) {
        if (stockCommandErrorRequiresReconcile(cause)) {
          try {
            await reconcile();
          } catch {
            // Keep the authoritative command error; the next normal refresh can reconcile again.
          }
        }
        return {
          ok: false,
          message: stockCommandErrorMessage(cause, 'Không thể cập nhật tồn kho.'),
        };
      }

      try {
        await reconcile();
      } catch (cause: unknown) {
        setError(
          `${messageOf(cause, 'Chưa thể tải lại số lượng mới.')} Thao tác đã được ghi nhận; hãy tải lại dữ liệu để đối chiếu.`,
        );
      }
      return { ok: true };
    },
    [client, reconcile],
  );

  return (
    <InventoryShell breadcrumbs={[{ label: 'Kho hàng' }, { label: 'Tồn phụ kiện' }]}>
      <InventoryStockView
        error={error}
        levels={levels}
        loading={loading}
        locations={locations}
        pagination={pagination}
        query={query}
        variants={variants}
        onCommand={executeCommand}
        onQueryChange={updateQuery}
      />
    </InventoryShell>
  );
}

function currentQuery(): StockLevelQueryState {
  if (typeof window === 'undefined') return { page: 1, pageSize: 20 };
  return stockLevelQueryFromSearch(new URLSearchParams(window.location.search));
}

function variantOptions(levels: readonly InventoryStockLevel[]): StockVariantOption[] {
  const seen = new Set<string>();
  return levels.flatMap((level) => {
    if (seen.has(level.variant.id)) return [];
    seen.add(level.variant.id);
    return [
      {
        ...level.variant,
        productName: level.product?.name ?? 'Phụ kiện',
      },
    ];
  });
}

function mergeVariantOptions(
  current: readonly StockVariantOption[],
  incoming: readonly StockVariantOption[],
): StockVariantOption[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) =>
    `${left.productName} ${left.displayName}`.localeCompare(
      `${right.productName} ${right.displayName}`,
      'vi',
    ),
  );
}

function messageOf(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
