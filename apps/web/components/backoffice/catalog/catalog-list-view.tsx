import { ArrowRightIcon, MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { BackofficePagination, CatalogVoucherStatusChip } from '@/components/backoffice';
import { CatalogMediaImage, type CatalogMediaSource } from './catalog-media';
import {
  buildCatalogListHref,
  catalogDisplayCode,
  catalogProductTypeLabel,
  catalogQueryFromSearchParams,
  catalogStatusCountLabel,
  catalogStatusLabel,
  formatCatalogDate,
  type CatalogQueryState,
  type CatalogRecordStatus,
  type CatalogProductType,
} from './catalog-presenter';
import styles from './catalog.module.css';

export interface CatalogListProduct {
  readonly id: string;
  readonly name: string;
  readonly primaryMedia: CatalogMediaSource | null;
  readonly releaseYear?: number | null;
  readonly slug: string;
  readonly status: CatalogRecordStatus;
  readonly type: CatalogProductType;
  readonly updatedAt: string;
  readonly variantCount: number;
}

export interface CatalogStatusCounts {
  readonly ACTIVE: number;
  readonly ARCHIVED: number;
  readonly DRAFT: number;
  readonly total: number;
}

export interface CatalogPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

interface CatalogListViewProps {
  readonly counts: CatalogStatusCounts;
  readonly error?: string | null;
  readonly loading?: boolean;
  readonly pagination: CatalogPagination;
  readonly products: readonly CatalogListProduct[];
  readonly query: CatalogQueryState;
}

const STATUS_TABS: ReadonlyArray<{ label: string; status?: CatalogRecordStatus }> = [
  { label: 'Tất cả' },
  { label: catalogStatusCountLabel('ACTIVE'), status: 'ACTIVE' },
  { label: catalogStatusCountLabel('DRAFT'), status: 'DRAFT' },
  { label: catalogStatusCountLabel('ARCHIVED'), status: 'ARCHIVED' },
];

export function CatalogListView({
  counts,
  error = null,
  loading = false,
  pagination,
  products,
  query,
}: CatalogListViewProps) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <h1>Danh mục sản phẩm</h1>
          <p>Theo dõi sản phẩm theo trạng thái và cập nhật thông tin khi cần.</p>
        </div>
        <Link className={styles.primaryLink} href="/backoffice/catalog/products/new">
          <PlusIcon aria-hidden="true" size={18} weight="bold" />
          Thêm sản phẩm
        </Link>
      </header>

      {error === null ? null : (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <CatalogListFilters query={query} />

      <nav className={styles.toolbarTabs} aria-label="Lọc theo trạng thái sản phẩm">
        {STATUS_TABS.map((tab) => {
          const active =
            query.status === tab.status || (query.status === undefined && tab.status === undefined);
          const count = tab.status === undefined ? counts.total : counts[tab.status];
          return (
            <Link
              className={styles.tabLink}
              data-active={active}
              href={buildCatalogListHref(query, { page: 1, status: tab.status })}
              key={tab.label}
            >
              {tab.label}
              <span className={styles.tabCount}>{String(count)}</span>
            </Link>
          );
        })}
      </nav>

      <section
        className={styles.board}
        aria-busy={loading || undefined}
        aria-label="Danh sách sản phẩm"
      >
        {loading ? <CatalogListLoading /> : null}
        {!loading && products.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>Chưa có sản phẩm phù hợp</h2>
            <p>Thay đổi bộ lọc hoặc thêm một sản phẩm mới.</p>
            <Link className={styles.secondaryLink} href="/backoffice/catalog/products/new">
              Thêm sản phẩm
            </Link>
          </div>
        ) : null}
        {!loading
          ? products.map((product, index) => (
              <CatalogProductCard key={product.id} priority={index < 2} product={product} />
            ))
          : null}
      </section>

      <BackofficePagination
        buildHref={(page) => buildCatalogListHref(query, { page })}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </div>
  );
}

function CatalogListFilters({ query }: Readonly<{ query: CatalogQueryState }>) {
  const sortValue = `${query.sortBy}:${query.sortOrder}`;
  return (
    <form action="/backoffice/catalog/products" className={styles.filters} method="get">
      <div className={styles.searchField}>
        <label className="rp-visually-hidden" htmlFor="catalog-search">
          Tìm tên hoặc đường dẫn sản phẩm
        </label>
        <MagnifyingGlassIcon aria-hidden="true" size={20} />
        <input
          defaultValue={query.q ?? ''}
          id="catalog-search"
          maxLength={100}
          name="q"
          placeholder="Tìm tên hoặc đường dẫn sản phẩm"
          type="search"
        />
      </div>
      <label className="rp-visually-hidden" htmlFor="catalog-type">
        Loại sản phẩm
      </label>
      <select
        className={styles.filterSelect}
        defaultValue={query.type ?? ''}
        id="catalog-type"
        name="type"
      >
        <option value="">Loại sản phẩm</option>
        <option value="IPHONE">iPhone</option>
        <option value="ACCESSORY">Phụ kiện</option>
      </select>
      <label className="rp-visually-hidden" htmlFor="catalog-year">
        Năm ra mắt
      </label>
      <input
        className={styles.filterSelect}
        defaultValue={query.releaseYear ?? ''}
        id="catalog-year"
        inputMode="numeric"
        max={2100}
        min={2007}
        name="releaseYear"
        placeholder="Năm ra mắt"
        type="number"
      />
      <label className="rp-visually-hidden" htmlFor="catalog-sort">
        Sắp xếp sản phẩm
      </label>
      <select
        className={styles.filterSelect}
        defaultValue={sortValue}
        id="catalog-sort"
        name="sort"
      >
        <option value="updatedAt:desc">Cập nhật mới nhất</option>
        <option value="updatedAt:asc">Cập nhật cũ nhất</option>
        <option value="createdAt:desc">Tạo mới nhất</option>
        <option value="name:asc">Tên từ A đến Z</option>
        <option value="releaseYear:desc">Năm ra mắt mới nhất</option>
      </select>
      {query.status === undefined ? null : (
        <input name="status" type="hidden" value={query.status} />
      )}
      <SortQueryFields value={sortValue} />
      <button className="rp-visually-hidden" type="submit">
        Áp dụng bộ lọc
      </button>
    </form>
  );
}

/**
 * HTML forms cannot split a friendly compound sort choice into two query fields without script.
 * The list controller also understands the `sort` fallback and normalizes it before loading.
 */
function SortQueryFields({ value }: Readonly<{ value: string }>) {
  const [sortBy, sortOrder] = value.split(':');
  return (
    <>
      <input name="sortBy" type="hidden" value={sortBy ?? 'updatedAt'} />
      <input name="sortOrder" type="hidden" value={sortOrder ?? 'desc'} />
    </>
  );
}

function CatalogProductCard({
  priority,
  product,
}: Readonly<{ priority: boolean; product: CatalogListProduct }>) {
  return (
    <Link className={styles.productCard} href={`/backoffice/catalog/products/${product.id}`}>
      <div className={styles.productIdentity}>
        <CatalogMediaImage
          className={styles.productThumbnail}
          fallbackLabel={`Chưa có ảnh cho ${product.name}`}
          media={product.primaryMedia}
          priority={priority}
        />
        <div className={styles.productCopy}>
          <h2>{product.name}</h2>
          <span className={styles.productCode}>{catalogDisplayCode(product.slug)}</span>
          <span className={styles.productMeta}>
            {catalogProductTypeLabel(product.type)}
            {product.releaseYear === null || product.releaseYear === undefined
              ? ''
              : ` · ${String(product.releaseYear)}`}
          </span>
          <span className={styles.cardStatus}>
            <CatalogVoucherStatusChip
              label={catalogStatusLabel(product.status)}
              status={product.status}
            />
          </span>
        </div>
      </div>
      <div className={styles.productMetrics}>
        <span className={styles.productMetric}>
          <strong>{String(product.variantCount)} biến thể</strong>
          <span>{formatCatalogDate(product.updatedAt)}</span>
        </span>
        <span className={styles.cardArrow} aria-hidden="true">
          <ArrowRightIcon size={20} />
        </span>
      </div>
    </Link>
  );
}

function CatalogListLoading() {
  return (
    <div className={styles.loadingState} role="status">
      <h2>Đang tải danh mục</h2>
      <p>Dữ liệu sản phẩm sẽ xuất hiện trong giây lát.</p>
      <span className="rp-visually-hidden">Đang tải…</span>
    </div>
  );
}

export function catalogListQueryFromUrl(searchParams: URLSearchParams): CatalogQueryState {
  const values = Object.fromEntries(searchParams.entries());
  const compoundSort = searchParams.get('sort');
  if (compoundSort !== null) {
    const [sortBy, sortOrder] = compoundSort.split(':');
    values['sortBy'] = sortBy ?? '';
    values['sortOrder'] = sortOrder ?? '';
  }
  return catalogQueryFromSearchParams(values);
}
