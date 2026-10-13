'use client';

import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { createApiClient, type components } from '@rephone/api-client';
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { browserApiBaseUrl } from '@/lib/api';
import styles from './storefront-search.module.css';

type ProductSuggestion = components['schemas']['ProductListItemDto'];

const catalogClient = createApiClient({ baseUrl: browserApiBaseUrl });

interface StorefrontSearchProps {
  readonly id: string;
  readonly onNavigate?: (() => void) | undefined;
  readonly variant: 'desktop' | 'mobile' | 'compact';
}

export function StorefrontSearch({ id, onNavigate, variant }: StorefrontSearchProps) {
  const compact = variant !== 'mobile';
  const listId = useId();
  const requestId = useRef(0);
  const optionRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly ProductSuggestion[]>([]);
  const normalizedQuery = query.trim();

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setActiveIndex(-1);
    setFailed(false);

    if (normalizedQuery.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let controller: AbortController | undefined;
    const timer = window.setTimeout(() => {
      controller = new AbortController();
      void loadProductSuggestions(normalizedQuery, controller.signal)
        .then((items) => {
          if (requestId.current !== currentRequest || controller?.signal.aborted === true) return;
          setSuggestions(items);
        })
        .catch((caught: unknown) => {
          if (controller?.signal.aborted === true || isAbortError(caught)) return;
          if (requestId.current === currentRequest) {
            setSuggestions([]);
            setFailed(true);
          }
        })
        .finally(() => {
          if (requestId.current === currentRequest && controller?.signal.aborted !== true) {
            setLoading(false);
          }
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [normalizedQuery]);

  const visible = open && normalizedQuery.length >= 2;
  const activeSuggestion = activeIndex < 0 ? undefined : suggestions[activeIndex];

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length > 0) {
      const direction = event.key;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        nextStorefrontSuggestionIndex(current, suggestions.length, direction),
      );
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      optionRefs.current[activeIndex]?.click();
    }
  };

  return (
    <form
      action="/products"
      className={styles.search}
      data-variant={variant}
      method="get"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        setActiveIndex(-1);
      }}
      onFocus={() => {
        if (normalizedQuery.length >= 2) setOpen(true);
      }}
      role="search"
      aria-label={variant === 'mobile' ? 'Tìm trong danh mục' : 'Tìm kiếm sản phẩm'}
    >
      <label className={compact ? styles.visuallyHidden : styles.label} htmlFor={id}>
        Tìm iPhone hoặc phụ kiện
      </label>
      <div className={styles.control}>
        <input
          aria-activedescendant={
            activeSuggestion === undefined ? undefined : `${listId}-${activeSuggestion.id}`
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={visible}
          autoComplete="off"
          id={id}
          maxLength={100}
          name="q"
          onChange={(event) => {
            const nextQuery = event.currentTarget.value;
            setQuery(nextQuery);
            setOpen(nextQuery.trim().length >= 2);
          }}
          onKeyDown={handleKeyDown}
          placeholder={compact ? 'Tìm iPhone hoặc phụ kiện' : 'Nhập tên sản phẩm'}
          role="combobox"
          type="search"
          value={query}
        />
        <button type="submit" aria-label={compact ? 'Tìm kiếm' : undefined}>
          {compact ? <MagnifyingGlassIcon aria-hidden="true" size={20} weight="bold" /> : 'Tìm'}
        </button>
      </div>

      {visible ? (
        <div
          aria-busy={loading || undefined}
          aria-label="Gợi ý sản phẩm"
          aria-live="polite"
          className={styles.suggestionPanel}
          id={listId}
          role="listbox"
        >
          {loading ? <SuggestionMessage>Đang tìm sản phẩm…</SuggestionMessage> : null}
          {!loading && failed ? (
            <SuggestionMessage>Chưa thể tải gợi ý. Bạn vẫn có thể nhấn Tìm.</SuggestionMessage>
          ) : null}
          {!loading && !failed && suggestions.length === 0 ? (
            <SuggestionMessage>Không tìm thấy sản phẩm phù hợp.</SuggestionMessage>
          ) : null}
          {!loading
            ? suggestions.map((suggestion, index) => (
                <Link
                  aria-selected={index === activeIndex}
                  className={styles.suggestionOption}
                  href={`/products/${suggestion.slug}`}
                  id={`${listId}-${suggestion.id}`}
                  key={suggestion.id}
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  role="option"
                  tabIndex={-1}
                >
                  <span>
                    <strong>{suggestion.name}</strong>
                    <small>{suggestionLabel(suggestion)}</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))
            : null}
        </div>
      ) : null}
    </form>
  );
}

function SuggestionMessage({ children }: Readonly<{ children: string }>) {
  return (
    <div
      aria-disabled="true"
      aria-selected="false"
      className={styles.suggestionMessage}
      role="option"
    >
      {children}
    </div>
  );
}

async function loadProductSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<readonly ProductSuggestion[]> {
  const result = await catalogClient.GET('/api/v1/products', {
    params: {
      query: {
        page: 1,
        pageSize: 6,
        q: query,
        sortBy: 'releaseYear',
        sortOrder: 'desc',
      },
    },
    signal,
  });
  if (result.data === undefined) throw new Error('Không thể tải gợi ý sản phẩm.');
  return result.data.data.slice(0, 6);
}

function suggestionLabel(suggestion: ProductSuggestion): string {
  const kind = suggestion.productType === 'IPHONE' ? 'iPhone' : 'Phụ kiện';
  const year =
    suggestion.releaseYear === null || suggestion.releaseYear === undefined
      ? ''
      : ` · ${String(suggestion.releaseYear)}`;
  return `${kind}${year}${suggestion.inStock ? '' : ' · Tạm hết máy'}`;
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
}

export function nextStorefrontSuggestionIndex(
  current: number,
  total: number,
  direction: 'ArrowDown' | 'ArrowUp',
): number {
  if (total <= 0) return -1;
  if (direction === 'ArrowDown') return current < 0 || current >= total - 1 ? 0 : current + 1;
  return current <= 0 ? total - 1 : current - 1;
}
