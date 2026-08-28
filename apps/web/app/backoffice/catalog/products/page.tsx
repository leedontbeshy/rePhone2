'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CatalogVoucherShell } from '@/components/backoffice';
import {
  CatalogListView,
  catalogListQueryFromUrl,
  type CatalogListProduct,
  type CatalogPagination,
  type CatalogStatusCounts,
} from '@/components/backoffice/catalog/catalog-list-view';
import type { CatalogQueryState } from '@/components/backoffice/catalog/catalog-presenter';
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

export default function CatalogProductsPage() {
  const searchParams = useSearchParams();
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const query = useMemo(
    () => catalogListQueryFromUrl(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [products, setProducts] = useState<CatalogListProduct[]>([]);
  const [pagination, setPagination] = useState<CatalogPagination>(EMPTY_PAGINATION);
  const [counts, setCounts] = useState<CatalogStatusCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [page, total, active, draft, archived] = await Promise.all([
      listCatalogProducts(client, adapterQuery(query)),
      listCatalogProducts(client, countQuery(query)),
      listCatalogProducts(client, countQuery(query, 'active')),
      listCatalogProducts(client, countQuery(query, 'draft')),
      listCatalogProducts(client, countQuery(query, 'archived')),
    ]);
    setProducts(page.data.map(presentListProduct));
    setPagination(page.pagination);
    setCounts({
      ACTIVE: active.pagination.totalItems,
      ARCHIVED: archived.pagination.totalItems,
      DRAFT: draft.pagination.totalItems,
      total: total.pagination.totalItems,
    });
  }, [client, query]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let current = true;
    setLoading(true);
    setError(null);
    void load()
      .catch((caught: unknown) => {
        if (current) {
          setError(caught instanceof Error ? caught.message : 'Không thể tải danh mục sản phẩm.');
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isStaff, load, status]);

  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Vận hành' }, { label: 'Danh mục' }]}>
      <CatalogListView
        counts={counts}
        error={error}
        loading={loading}
        pagination={pagination}
        products={products}
        query={query}
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
  query: CatalogQueryState,
  status?: 'active' | 'archived' | 'draft',
): CatalogProductListQuery {
  const base = adapterQuery(query);
  return {
    ...base,
    page: 1,
    pageSize: 1,
    ...(status === undefined ? { status: '' } : { status }),
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
