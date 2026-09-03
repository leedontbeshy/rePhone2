'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CatalogVoucherShell } from '@/components/backoffice';
import {
  CatalogListView,
  clampCatalogPage,
  catalogListQueryFromUrl,
  type CatalogListProduct,
  type CatalogPagination,
  type CatalogQueryChangeOptions,
  type CatalogStatusCounts,
  type CatalogSuggestion,
} from '@/components/backoffice/catalog/catalog-list-view';
import {
  buildCatalogListHref,
  type CatalogQueryOverrides,
  type CatalogQueryState,
} from '@/components/backoffice/catalog/catalog-presenter';
import {
  listCatalogProducts,
  type CatalogProductListItem,
  type CatalogProductListQuery,
} from '@/lib/backoffice-catalog-api';

const EMPTY_COUNTS: CatalogStatusCounts = { ACTIVE: 0, ARCHIVED: 0, DRAFT: 0, total: 0 };
const EMPTY_PAGINATION: CatalogPagination = {
  page: 1,
  pageSize: 6,
  totalItems: 0,
  totalPages: 0,
};

interface CatalogSnapshot {
  readonly ownerKey: string;
  readonly pagination: CatalogPagination;
  readonly products: readonly CatalogListProduct[];
  readonly queryKey: string;
}

interface CatalogLoadError {
  readonly message: string;
  readonly queryKey: string;
}

export default function CatalogProductsPage() {
  return (
    <Suspense fallback={<CatalogProductsPageFallback />}>
      <CatalogProductsPageContent />
    </Suspense>
  );
}

function CatalogProductsPageContent() {
  const searchParams = useSearchParams();
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const queryFromUrl = useMemo(
    () => catalogListQueryFromUrl(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [query, setQuery] = useState(queryFromUrl);
  const queryRef = useRef(query);
  const ownerKey = status === 'authenticated' && isStaff ? user.id : null;
  const queryKey = useMemo(() => buildCatalogListHref(query, {}), [query]);
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [counts, setCounts] = useState<CatalogStatusCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<CatalogLoadError | null>(null);
  const pendingBoardFocusRef = useRef(false);
  const [focusBoardRequest, setFocusBoardRequest] = useState(0);
  const countFilters = useMemo(
    () => ({
      ...(query.q === undefined ? {} : { q: query.q }),
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.releaseYear === undefined ? {} : { releaseYear: query.releaseYear }),
    }),
    [query.q, query.releaseYear, query.type],
  );

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    setQuery((current) => {
      if (catalogQueriesEqual(current, queryFromUrl)) return current;
      pendingBoardFocusRef.current = false;
      queryRef.current = queryFromUrl;
      return queryFromUrl;
    });
  }, [queryFromUrl]);

  useEffect(() => {
    const handleHistoryChange = () => {
      const next = catalogListQueryFromUrl(new URLSearchParams(window.location.search));
      if (catalogQueriesEqual(queryRef.current, next)) return;
      pendingBoardFocusRef.current = false;
      queryRef.current = next;
      setQuery(next);
    };
    window.addEventListener('popstate', handleHistoryChange);
    return () => {
      window.removeEventListener('popstate', handleHistoryChange);
    };
  }, []);

  const updateQuery = useCallback(
    (overrides: CatalogQueryOverrides, options: CatalogQueryChangeOptions = {}) => {
      const href = buildCatalogListHref(queryRef.current, overrides);
      const next = catalogListQueryFromUrl(new URL(href, window.location.origin).searchParams);
      if (catalogQueriesEqual(queryRef.current, next)) return;
      pendingBoardFocusRef.current = options.focusBoard === true;
      queryRef.current = next;
      window.history[options.history === 'replace' ? 'replaceState' : 'pushState'](null, '', href);
      setQuery(next);
    },
    [],
  );

  const loadSuggestions = useCallback(
    async (search: string, signal: AbortSignal): Promise<readonly CatalogSuggestion[]> => {
      if (search.trim().length < 2) return [];
      const result = await listCatalogProducts(
        client,
        {
          page: 1,
          pageSize: 6,
          search,
          sortBy: 'releaseYear',
          sortOrder: 'desc',
        },
        { signal },
      );
      return result.data.map(presentSuggestion);
    },
    [client],
  );

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff || ownerKey === null) {
      setSnapshot(null);
      setLoadError(null);
      setLoading(status === 'loading');
      return;
    }
    const controller = new AbortController();
    let clamping = false;
    setLoading(true);
    setLoadError(null);
    void listCatalogProducts(client, adapterQuery(query), { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        const validPage = clampCatalogPage(query.page, page.pagination.totalPages);
        if (validPage !== query.page) {
          clamping = true;
          pendingBoardFocusRef.current = false;
          updateQuery({ page: validPage }, { history: 'replace' });
          return;
        }
        setSnapshot({
          ownerKey,
          pagination: page.pagination,
          products: page.data.map(presentListProduct),
          queryKey,
        });
        if (pendingBoardFocusRef.current) {
          pendingBoardFocusRef.current = false;
          setFocusBoardRequest((current) => current + 1);
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setLoadError({
          message: caught instanceof Error ? caught.message : 'Không thể tải danh mục sản phẩm.',
          queryKey,
        });
        pendingBoardFocusRef.current = false;
      })
      .finally(() => {
        if (!controller.signal.aborted && !clamping) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [client, isStaff, ownerKey, query, queryKey, status, updateQuery]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    const controller = new AbortController();
    void Promise.all([
      listCatalogProducts(client, countQuery(countFilters, 'active'), {
        signal: controller.signal,
      }),
      listCatalogProducts(client, countQuery(countFilters, 'draft'), {
        signal: controller.signal,
      }),
      listCatalogProducts(client, countQuery(countFilters, 'archived'), {
        signal: controller.signal,
      }),
    ])
      .then(([active, draft, archived]) => {
        if (controller.signal.aborted) return;
        setCounts({
          ACTIVE: active.pagination.totalItems,
          ARCHIVED: archived.pagination.totalItems,
          DRAFT: draft.pagination.totalItems,
          total:
            active.pagination.totalItems +
            archived.pagination.totalItems +
            draft.pagination.totalItems,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        // Status totals are supporting information. Keep the last successful totals instead of
        // replacing a valid product-list state with an unrelated count error.
      });
    return () => {
      controller.abort();
    };
  }, [client, countFilters, isStaff, status]);

  const ownedSnapshot = snapshot?.ownerKey === ownerKey ? snapshot : null;
  const currentError = loadError?.queryKey === queryKey ? loadError.message : null;
  const showingPreviousResults =
    currentError !== null && ownedSnapshot !== null && ownedSnapshot.queryKey !== queryKey;
  const pagination = ownedSnapshot?.pagination ?? {
    ...EMPTY_PAGINATION,
    page: query.page,
    pageSize: query.pageSize,
  };

  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Vận hành' }, { label: 'Danh mục' }]}>
      <CatalogListView
        counts={counts}
        error={currentError}
        focusBoardRequest={focusBoardRequest}
        loading={loading}
        pagination={pagination}
        products={ownedSnapshot?.products ?? []}
        loadSuggestions={loadSuggestions}
        onQueryChange={updateQuery}
        query={query}
        showingPreviousResults={showingPreviousResults}
      />
    </CatalogVoucherShell>
  );
}

function CatalogProductsPageFallback() {
  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Vận hành' }, { label: 'Danh mục' }]}>
      <CatalogListView
        counts={EMPTY_COUNTS}
        error={null}
        loading
        pagination={EMPTY_PAGINATION}
        products={[]}
        query={{ page: 1, pageSize: 6, sortBy: 'releaseYear', sortOrder: 'desc' }}
      />
    </CatalogVoucherShell>
  );
}

function adapterQuery(query: CatalogQueryState): CatalogProductListQuery {
  return {
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...(query.q === undefined ? {} : { search: query.q }),
    ...(query.type === undefined
      ? {}
      : { type: query.type === 'IPHONE' ? ('iphone' as const) : ('accessory' as const) }),
    ...(query.status === undefined
      ? {}
      : {
          status:
            query.status === 'ACTIVE'
              ? ('active' as const)
              : query.status === 'ARCHIVED'
                ? ('archived' as const)
                : ('draft' as const),
        }),
    ...(query.releaseYear === undefined ? {} : { releaseYear: query.releaseYear }),
  };
}

function countQuery(
  filters: Pick<CatalogQueryState, 'q' | 'releaseYear' | 'type'>,
  status: 'active' | 'archived' | 'draft',
): CatalogProductListQuery {
  return {
    page: 1,
    pageSize: 1,
    sortBy: 'releaseYear',
    sortOrder: 'desc',
    status,
    ...(filters.q === undefined ? {} : { search: filters.q }),
    ...(filters.type === undefined
      ? {}
      : { type: filters.type === 'IPHONE' ? ('iphone' as const) : ('accessory' as const) }),
    ...(filters.releaseYear === undefined ? {} : { releaseYear: filters.releaseYear }),
  };
}

function presentListProduct(product: CatalogProductListItem): CatalogListProduct {
  return {
    id: product.id,
    name: product.name,
    primaryMedia: product.primaryMedia,
    releaseYear: product.releaseYear,
    slug: product.slug,
    status:
      product.status === 'active' ? 'ACTIVE' : product.status === 'archived' ? 'ARCHIVED' : 'DRAFT',
    type: product.type === 'iphone' ? 'IPHONE' : 'ACCESSORY',
    updatedAt: product.updatedAt,
    variantCount: product.variantCount,
  };
}

function presentSuggestion(product: CatalogProductListItem): CatalogSuggestion {
  return {
    id: product.id,
    name: product.name,
    primaryMedia: product.primaryMedia,
    releaseYear: product.releaseYear,
    type: product.type === 'iphone' ? 'IPHONE' : 'ACCESSORY',
  };
}

function catalogQueriesEqual(left: CatalogQueryState, right: CatalogQueryState): boolean {
  return buildCatalogListHref(left, {}) === buildCatalogListHref(right, {});
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
}
