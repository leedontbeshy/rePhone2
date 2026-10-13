'use client';

import { ArrowRightIcon, MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';
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

export interface CatalogSuggestion {
  readonly id: string;
  readonly name: string;
  readonly primaryMedia: CatalogMediaSource | null;
  readonly releaseYear?: number | null;
  readonly type: CatalogProductType;
}

export interface CatalogQueryChangeOptions {
  readonly focusBoard?: boolean;
  readonly history?: 'push' | 'replace';
}

interface CatalogListViewProps {
  readonly counts: CatalogStatusCounts;
  readonly error?: string | null;
  readonly focusBoardRequest?: number;
  readonly loading?: boolean;
  readonly pagination: CatalogPagination;
  readonly products: readonly CatalogListProduct[];
  readonly query: CatalogQueryState;
  readonly loadSuggestions?: (
    search: string,
    signal: AbortSignal,
  ) => Promise<readonly CatalogSuggestion[]>;
  readonly onQueryChange?: (
    overrides: Parameters<typeof buildCatalogListHref>[1],
    options?: CatalogQueryChangeOptions,
  ) => void;
  readonly showingPreviousResults?: boolean;
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
  focusBoardRequest = 0,
  loading = false,
  pagination,
  products,
  query,
  loadSuggestions,
  onQueryChange,
  showingPreviousResults = false,
}: CatalogListViewProps) {
  const boardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusBoardRequest <= 0) return;
    boardRef.current?.focus();
  }, [focusBoardRequest]);

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
          <strong>{error}</strong>
          {showingPreviousResults ? (
            <span> Danh sách bên dưới vẫn là kết quả của bộ lọc trước đó.</span>
          ) : null}
        </div>
      )}

      <CatalogListFilters
        loadSuggestions={loadSuggestions}
        onQueryChange={onQueryChange}
        query={query}
      />

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
              onClick={(event) => {
                if (!canHandleLinkClick(event) || onQueryChange === undefined) return;
                event.preventDefault();
                onQueryChange({ page: 1, status: tab.status });
              }}
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
        ref={boardRef}
        tabIndex={-1}
      >
        {loading && products.length === 0 ? <CatalogListLoading /> : null}
        {loading && products.length > 0 ? (
          <p className={styles.updateStatus} role="status">
            Đang cập nhật danh sách…
          </p>
        ) : null}
        {!loading && error === null && products.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>Chưa có sản phẩm phù hợp</h2>
            <p>Thay đổi bộ lọc hoặc thêm một sản phẩm mới.</p>
            <Link className={styles.secondaryLink} href="/backoffice/catalog/products/new">
              Thêm sản phẩm
            </Link>
          </div>
        ) : null}
        {products.map((product, index) => (
          <CatalogProductCard key={product.id} priority={index < 2} product={product} />
        ))}
      </section>

      <div
        onClick={(event) => {
          if (!canHandleLinkClick(event) || onQueryChange === undefined) return;
          const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
          if (anchor === null) return;
          const page = Number(new URL(anchor.href).searchParams.get('page') ?? '1');
          if (!Number.isSafeInteger(page) || page < 1) return;
          event.preventDefault();
          onQueryChange({ page }, { focusBoard: true });
        }}
      >
        <BackofficePagination
          buildHref={(page) => buildCatalogListHref(query, { page })}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
        />
      </div>
    </div>
  );
}

function CatalogListFilters({
  loadSuggestions,
  onQueryChange,
  query,
}: Readonly<{
  loadSuggestions?: CatalogListViewProps['loadSuggestions'];
  onQueryChange?: CatalogListViewProps['onQueryChange'];
  query: CatalogQueryState;
}>) {
  const sortValue = `${query.sortBy}:${query.sortOrder}`;
  const [searchValue, setSearchValue] = useState(query.q ?? '');
  const [yearValue, setYearValue] = useState(
    query.releaseYear === undefined ? '' : String(query.releaseYear),
  );

  useEffect(() => {
    setSearchValue(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    setYearValue(query.releaseYear === undefined ? '' : String(query.releaseYear));
  }, [query.releaseYear]);

  useEffect(() => {
    if (onQueryChange === undefined) return;
    const normalized = searchValue.trim();
    if (normalized === (query.q ?? '')) return;
    const timer = window.setTimeout(() => {
      onQueryChange(
        { page: 1, q: normalized === '' ? undefined : normalized },
        { history: 'replace' },
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onQueryChange, query.q, searchValue]);

  const applyFilters = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (onQueryChange === undefined) return;
    const releaseYear = normalizedReleaseYear(yearValue);
    onQueryChange({
      page: 1,
      q: searchValue.trim() === '' ? undefined : searchValue.trim(),
      releaseYear,
    });
  };

  return (
    <form className={styles.filters} onSubmit={applyFilters}>
      <CatalogSearchCombobox
        loadSuggestions={loadSuggestions}
        onValueChange={setSearchValue}
        value={searchValue}
      />
      <label className="rp-visually-hidden" htmlFor="catalog-type">
        Loại sản phẩm
      </label>
      <select
        className={styles.filterSelect}
        id="catalog-type"
        onChange={(event) => {
          if (onQueryChange === undefined) return;
          const value = event.currentTarget.value;
          onQueryChange({
            page: 1,
            type: value === 'IPHONE' || value === 'ACCESSORY' ? value : undefined,
          });
        }}
        value={query.type ?? ''}
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
        id="catalog-year"
        inputMode="numeric"
        max={2100}
        min={2007}
        onChange={(event) => {
          setYearValue(event.currentTarget.value);
        }}
        onBlur={() => {
          if (onQueryChange === undefined) return;
          const releaseYear = normalizedReleaseYear(yearValue);
          if (
            releaseYear === query.releaseYear ||
            (releaseYear === undefined && yearValue !== '')
          ) {
            return;
          }
          onQueryChange({ page: 1, releaseYear });
        }}
        placeholder="Năm ra mắt"
        type="number"
        value={yearValue}
      />
      <label className="rp-visually-hidden" htmlFor="catalog-sort">
        Sắp xếp sản phẩm
      </label>
      <select
        className={styles.filterSelect}
        id="catalog-sort"
        onChange={(event) => {
          if (onQueryChange === undefined) return;
          const [sortBy, sortOrder] = event.currentTarget.value.split(':');
          if (!isCatalogSortBy(sortBy) || (sortOrder !== 'asc' && sortOrder !== 'desc')) return;
          onQueryChange({ page: 1, sortBy, sortOrder });
        }}
        value={sortValue}
      >
        <option value="releaseYear:desc">Năm ra mắt mới nhất</option>
        <option value="releaseYear:asc">Năm ra mắt cũ nhất</option>
        <option value="updatedAt:desc">Cập nhật mới nhất</option>
        <option value="updatedAt:asc">Cập nhật cũ nhất</option>
        <option value="createdAt:desc">Tạo mới nhất</option>
        <option value="name:asc">Tên từ A đến Z</option>
      </select>
      <button className="rp-visually-hidden" type="submit">
        Áp dụng bộ lọc
      </button>
    </form>
  );
}

function CatalogSearchCombobox({
  loadSuggestions,
  onValueChange,
  value,
}: Readonly<{
  loadSuggestions?: CatalogListViewProps['loadSuggestions'];
  onValueChange: (value: string) => void;
  value: string;
}>) {
  const listId = useId();
  const requestId = useRef(0);
  const optionRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly CatalogSuggestion[]>([]);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [retryRequest, setRetryRequest] = useState(0);
  const normalized = value.trim();

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setActiveIndex(-1);
    if (normalized.length < 2 || loadSuggestions === undefined) {
      setSuggestions([]);
      setSuggestionsError(false);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestions([]);
    setSuggestionsError(false);
    setSuggestionsLoading(true);
    let controller: AbortController | undefined;
    const timer = window.setTimeout(() => {
      controller = new AbortController();
      void loadSuggestions(normalized, controller.signal)
        .then((items) => {
          if (requestId.current !== currentRequest || controller?.signal.aborted === true) return;
          setSuggestions(items.slice(0, 6));
          setSuggestionsError(false);
        })
        .catch((caught: unknown) => {
          if (controller?.signal.aborted === true || isAbortError(caught)) return;
          if (requestId.current === currentRequest) {
            setSuggestions([]);
            setSuggestionsError(true);
          }
        })
        .finally(() => {
          if (requestId.current === currentRequest && controller?.signal.aborted !== true) {
            setSuggestionsLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [loadSuggestions, normalized, retryRequest]);

  const visible = open && normalized.length >= 2;
  const activeSuggestion = activeIndex < 0 ? undefined : suggestions[activeIndex];

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length > 0) {
      const direction = event.key;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => nextSuggestionIndex(current, suggestions.length, direction));
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      optionRefs.current[activeIndex]?.click();
    }
  };

  return (
    <div
      className={styles.searchField}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        setActiveIndex(-1);
      }}
      onFocus={() => {
        if (normalized.length >= 2) setOpen(true);
      }}
    >
      <label className="rp-visually-hidden" htmlFor="catalog-search">
        Tìm sản phẩm
      </label>
      <MagnifyingGlassIcon aria-hidden="true" size={20} />
      <input
        aria-activedescendant={
          activeSuggestion === undefined ? undefined : `${listId}-${activeSuggestion.id}`
        }
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={visible}
        autoComplete="off"
        id="catalog-search"
        maxLength={100}
        onChange={(event) => {
          onValueChange(event.currentTarget.value);
          setOpen(event.currentTarget.value.trim().length >= 2);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Tìm sản phẩm theo tên hoặc phiên bản"
        role="combobox"
        type="search"
        value={value}
      />
      {visible ? (
        <div className={styles.suggestionPanel}>
          <div
            aria-busy={suggestionsLoading || undefined}
            aria-label="Gợi ý sản phẩm"
            aria-live="polite"
            id={listId}
            role="listbox"
          >
            {suggestionsLoading ? (
              <div
                aria-disabled="true"
                aria-selected="false"
                className={styles.suggestionMessage}
                role="option"
              >
                Đang tìm sản phẩm…
              </div>
            ) : null}
            {!suggestionsLoading && !suggestionsError && suggestions.length === 0 ? (
              <div
                aria-disabled="true"
                aria-selected="false"
                className={styles.suggestionMessage}
                role="option"
              >
                Không tìm thấy sản phẩm phù hợp.
              </div>
            ) : null}
            {suggestions.map((suggestion, index) => (
              <Link
                aria-selected={index === activeIndex}
                className={styles.suggestionOption}
                href={`/backoffice/catalog/products/${suggestion.id}`}
                id={`${listId}-${suggestion.id}`}
                key={suggestion.id}
                onMouseEnter={() => {
                  setActiveIndex(index);
                }}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                role="option"
                tabIndex={-1}
              >
                <CatalogMediaImage
                  className={styles.suggestionThumbnail}
                  fallbackLabel={`Chưa có ảnh cho ${suggestion.name}`}
                  media={suggestion.primaryMedia}
                />
                <span className={styles.suggestionCopy}>
                  <strong>{suggestion.name}</strong>
                  <span>
                    {catalogProductTypeLabel(suggestion.type)}
                    {suggestion.releaseYear === null || suggestion.releaseYear === undefined
                      ? ''
                      : ` · ${String(suggestion.releaseYear)}`}
                  </span>
                </span>
                <ArrowRightIcon aria-hidden="true" size={18} />
              </Link>
            ))}
          </div>
          {!suggestionsLoading && suggestionsError ? (
            <div className={styles.suggestionMessage} role="presentation">
              <span role="alert">
                Không thể tải gợi ý. Nhấn Enter để tìm theo từ khóa hoặc thử lại.
              </span>{' '}
              <button
                className={styles.secondaryLink}
                onClick={() => {
                  setRetryRequest((current) => current + 1);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                type="button"
              >
                Thử lại
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function nextSuggestionIndex(
  current: number,
  total: number,
  direction: 'ArrowDown' | 'ArrowUp',
): number {
  if (total <= 0) return -1;
  if (direction === 'ArrowDown') return current >= total - 1 ? 0 : current + 1;
  return current <= 0 ? total - 1 : current - 1;
}

export function clampCatalogPage(requestedPage: number, totalPages: number): number {
  return Math.min(Math.max(1, requestedPage), Math.max(1, totalPages));
}

function normalizedReleaseYear(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2007 && parsed <= 2100 ? parsed : undefined;
}

function isCatalogSortBy(value: string | undefined): value is CatalogQueryState['sortBy'] {
  return (
    value === 'createdAt' || value === 'updatedAt' || value === 'name' || value === 'releaseYear'
  );
}

function canHandleLinkClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
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
        </div>
      </div>
      <div className={styles.productMetrics}>
        <span className={styles.cardStatus}>
          <CatalogVoucherStatusChip
            label={catalogStatusLabel(product.status)}
            status={product.status}
          />
        </span>
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
