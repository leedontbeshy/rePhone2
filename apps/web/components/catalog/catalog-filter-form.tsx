'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { formatVnd } from '@/components/ui';
import { searchParamValue, type CatalogSearchParams } from '@/lib/catalog-query';
import styles from './catalog-filter-toolbar.module.css';

interface CatalogFilterFormProps {
  readonly current: CatalogSearchParams;
  readonly idPrefix: string;
  readonly pageSize: number;
}
type Panel = 'price' | 'ramGb' | 'storageCapacityGb' | 'simLockStatus';
const OPTIONS: Record<Exclude<Panel, 'price'>, readonly { value: string; label: string }[]> = {
  ramGb: [1, 2, 3, 4, 6, 8, 12, 16].map((value) => ({
    value: String(value),
    label: `${String(value)} GB`,
  })),
  storageCapacityGb: [64, 128, 256, 512, 1024, 2048].map((value) => ({
    value: String(value),
    label: value < 1024 ? `${String(value)} GB` : `${String(value / 1024)} TB`,
  })),
  simLockStatus: [
    { value: 'UNLOCKED', label: 'Quốc tế' },
    { value: 'CARRIER_LOCKED', label: 'Khóa mạng' },
    { value: 'UNKNOWN', label: 'Chưa xác định' },
  ],
};
const LABELS = {
  price: 'Giá',
  ramGb: 'RAM',
  storageCapacityGb: 'Bộ nhớ trong',
  simLockStatus: 'Khóa mạng',
};
const KEYS = [
  'q',
  'productType',
  'releaseYear',
  'ramGb',
  'storageCapacityGb',
  'simLockStatus',
  'colorName',
  'minPrice',
  'maxPrice',
  'inStock',
  'sortBy',
  'sortOrder',
] as const;

export function CatalogFilterForm({ current, idPrefix, pageSize }: CatalogFilterFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<Panel | null>(null);
  const [search, setSearch] = useState(searchParamValue(current, 'q') ?? '');
  const maxPrice = Math.max(
    80000000,
    Number(searchParamValue(current, 'maxPrice')) || 0,
    Number(searchParamValue(current, 'minPrice')) || 0,
  );
  const [range, setRange] = useState([
    Number(searchParamValue(current, 'minPrice')) || 0,
    Number(searchParamValue(current, 'maxPrice')) || maxPrice,
  ]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const returnFocusAfterFilter = useRef<HTMLButtonElement | null>(null);
  const queryKey = JSON.stringify(current);
  useEffect(() => {
    if (!pending && returnFocusAfterFilter.current !== null) {
      returnFocusAfterFilter.current.focus();
      returnFocusAfterFilter.current = null;
    }
  }, [pending]);
  useEffect(() => {
    setSearch(searchParamValue(current, 'q') ?? '');
    setRange([
      Number(searchParamValue(current, 'minPrice')) || 0,
      Number(searchParamValue(current, 'maxPrice')) || maxPrice,
    ]);
  }, [queryKey, maxPrice]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    }
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  function apply(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const key of KEYS) {
      const value = searchParamValue(current, key);
      if (value) params.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    params.set('pageSize', String(pageSize));
    returnFocusAfterFilter.current = open === null ? null : trigger.current;
    setOpen(null);
    startTransition(() => {
      router.push(`/products?${params.toString()}`, { scroll: false });
    });
  }
  const stock = searchParamValue(current, 'inStock') === 'true';
  const sortBy = searchParamValue(current, 'sortBy') ?? 'generation';
  const sortOrder = searchParamValue(current, 'sortOrder') ?? 'desc';
  const sort = sortBy === 'fromPrice' ? sortOrder : undefined;
  return (
    <div
      ref={root}
      className={styles.toolbar}
      aria-busy={pending}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open !== null) {
          setOpen(null);
          trigger.current?.focus();
        }
      }}
    >
      <div className={styles.row}>
        <button
          type="button"
          className={styles.filterButton}
          aria-pressed={stock}
          disabled={pending}
          onClick={() => {
            apply({ inStock: stock ? undefined : 'true' });
          }}
        >
          Sẵn hàng
        </button>
        {(['price', 'ramGb', 'storageCapacityGb', 'simLockStatus'] as const).map((key) => {
          const value = searchParamValue(current, key);
          const active =
            key === 'price' ? Boolean(current['minPrice'] || current['maxPrice']) : Boolean(value);
          const choice =
            key === 'price' ? undefined : OPTIONS[key].find((item) => item.value === value)?.label;
          return (
            <div className={styles.filter} key={key}>
              <button
                type="button"
                className={styles.filterButton}
                data-active={active}
                aria-expanded={open === key}
                aria-controls={`${idPrefix}-${key}-options`}
                disabled={pending}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setOpen(open === key ? null : key);
                }}
              >
                {LABELS[key]}
                {choice ? `: ${choice}` : ''}
                <span aria-hidden="true">{open === key ? '−' : '+'}</span>
              </button>
              {open !== key ? null : (
                <div
                  id={`${idPrefix}-${key}-options`}
                  className={styles.popover}
                  role="group"
                  aria-label={`Lọc ${LABELS[key]}`}
                >
                  {key === 'price' ? (
                    <>
                      <strong>Khoảng giá</strong>
                      <output className={styles.rangeValue}>
                        {formatVnd(String(range[0] ?? 0))} –{' '}
                        {formatVnd(String(range[1] ?? maxPrice))}
                      </output>
                      <label htmlFor={`${idPrefix}-min-price`}>Giá thấp nhất</label>
                      <input
                        id={`${idPrefix}-min-price`}
                        type="range"
                        min={0}
                        max={maxPrice}
                        step={500000}
                        value={range[0]}
                        onChange={(event) => {
                          setRange([
                            Math.min(Number(event.target.value), range[1] ?? maxPrice),
                            range[1] ?? maxPrice,
                          ]);
                        }}
                      />
                      <label htmlFor={`${idPrefix}-max-price`}>Giá cao nhất</label>
                      <input
                        id={`${idPrefix}-max-price`}
                        type="range"
                        min={0}
                        max={maxPrice}
                        step={500000}
                        value={range[1]}
                        onChange={(event) => {
                          setRange([
                            range[0] ?? 0,
                            Math.max(Number(event.target.value), range[0] ?? 0),
                          ]);
                        }}
                      />
                      <button
                        type="button"
                        className={styles.apply}
                        onClick={() => {
                          apply({
                            minPrice: range[0] === 0 ? undefined : String(range[0]),
                            maxPrice: range[1] === maxPrice ? undefined : String(range[1]),
                          });
                        }}
                      >
                        Áp dụng khoảng giá
                      </button>
                      <button
                        type="button"
                        className={styles.option}
                        onClick={() => {
                          apply({ minPrice: undefined, maxPrice: undefined });
                        }}
                      >
                        Bỏ lọc giá
                      </button>
                    </>
                  ) : (
                    <>
                      {OPTIONS[key].map((item) => (
                        <button
                          type="button"
                          key={item.value}
                          className={styles.option}
                          aria-pressed={value === item.value}
                          onClick={() => {
                            apply({ [key]: item.value === value ? undefined : item.value });
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={styles.option}
                        onClick={() => {
                          apply({ [key]: undefined });
                        }}
                      >
                        Tất cả
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ q: search.trim() });
          }}
        >
          <label className="rp-visually-hidden" htmlFor={`${idPrefix}-q`}>
            Tìm máy
          </label>
          <input
            id={`${idPrefix}-q`}
            type="search"
            maxLength={100}
            placeholder="Tìm iPhone, cấu hình…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          <button type="submit" disabled={pending}>
            Tìm
          </button>
        </form>
      </div>
      <div className={styles.sortRow} aria-label="Sắp xếp sản phẩm">
        <span>Sắp xếp:</span>
        <button
          type="button"
          aria-pressed={sortBy === 'generation' && sortOrder === 'desc'}
          disabled={pending}
          onClick={() => {
            apply({ sortBy: 'generation', sortOrder: 'desc' });
          }}
        >
          Dòng mới nhất
        </button>
        <button
          type="button"
          aria-pressed={sort === 'asc'}
          disabled={pending}
          onClick={() => {
            apply({ sortBy: 'fromPrice', sortOrder: 'asc' });
          }}
        >
          Giá tăng dần
        </button>
        <button
          type="button"
          aria-pressed={sort === 'desc'}
          disabled={pending}
          onClick={() => {
            apply({ sortBy: 'fromPrice', sortOrder: 'desc' });
          }}
        >
          Giá giảm dần
        </button>
        <Link href="/products" className={styles.clear}>
          Xóa lọc
        </Link>
        {pending && <span role="status">Đang lọc…</span>}
      </div>
    </div>
  );
}
