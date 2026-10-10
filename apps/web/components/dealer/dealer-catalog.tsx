'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  MagnifyingGlassIcon as MagnifyingGlass,
  DeviceMobileIcon as DeviceMobile,
  ArrowRightIcon as ArrowRight,
  ArrowClockwiseIcon as ArrowClockwise,
  ShieldCheckIcon as ShieldCheck,
  BatteryHighIcon as BatteryHigh,
  FunnelSimpleIcon as FunnelSimple,
} from '@phosphor-icons/react';
import { Button, Input, Select, InlineAlert, Skeleton } from '@/components/ui';
import {
  dealerRecord,
  dealerRows,
  dealerText,
  dealerMoney,
  type DealerApi,
  type DealerRecord,
} from '@/lib/dealer-api';
import styles from './dealer.module.css';

export function DealerCatalog({
  api,
  choose,
}: {
  api: DealerApi;
  choose: (offer: DealerRecord) => void;
}) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState({ q: '', condition: '', sort: 'newest', page: 1, refresh: 0 });
  const [rows, setRows] = useState<DealerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: '12',
      q: query.q,
      sort: query.sort,
    });
    if (query.condition) params.set('condition', query.condition);
    void api
      .get(`dealer/catalog?${params.toString()}`)
      .then((value) => {
        if (!current) return;
        const result = dealerRecord(value);
        setRows(dealerRows(result['items']));
        setMore(result['hasMore'] === true);
      })
      .catch((caught: unknown) => {
        if (current) {
          setRows([]);
          setMore(false);
          setError(caught instanceof Error ? caught.message : 'Chưa tải được kho máy.');
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, query]);
  function reset() {
    setDraft('');
    setQuery({ q: '', condition: '', sort: 'newest', page: 1, refresh: query.refresh + 1 });
  }
  return (
    <section className={styles.list} aria-label="Kho máy dành cho đại lý">
      <div className={styles.sectionHeading}>
        <div>
          <h2>Chọn máy cho khách của bạn</h2>
          <p>Giá đại lý đã áp dụng. Mỗi mã tương ứng một máy thực tế trong kho.</p>
        </div>
        <span className={styles.trustLabel}>
          <ShieldCheck size={18} aria-hidden />
          Đã kiểm định
        </span>
      </div>
      <form
        className={styles.catalogToolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setQuery({ ...query, q: draft.trim(), page: 1, refresh: query.refresh + 1 });
        }}
      >
        <div className={styles.searchField}>
          <Input
            id="dealer-catalog-search"
            label="Tìm máy"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            maxLength={128}
            placeholder="iPhone 15, 256GB, màu hoặc mã máy…"
          />
        </div>
        <Select
          id="dealer-catalog-condition"
          label="Ngoại hình"
          value={query.condition}
          onChange={(event) => {
            setQuery({ ...query, condition: event.target.value, page: 1 });
          }}
        >
          <option value="">Tất cả ngoại hình</option>
          <option value="A">Loại A</option>
          <option value="B">Loại B</option>
          <option value="C">Loại C</option>
        </Select>
        <Select
          id="dealer-catalog-sort"
          label="Sắp xếp"
          value={query.sort}
          onChange={(event) => {
            setQuery({ ...query, sort: event.target.value, page: 1 });
          }}
        >
          <option value="newest">Máy mới nhập</option>
          <option value="price-asc">Giá thấp đến cao</option>
          <option value="price-desc">Giá cao đến thấp</option>
        </Select>
        <Button type="submit" loading={loading}>
          <MagnifyingGlass size={18} aria-hidden />
          Tìm máy
        </Button>
      </form>
      <div className={styles.catalogSummary}>
        <p role="status">
          {loading
            ? 'Đang cập nhật kho máy…'
            : error
              ? 'Kho máy chưa tải xong'
              : `${String(rows.length)} máy trên trang ${String(query.page)}${query.q ? ` · Kết quả cho “${query.q}”` : ''}`}
        </p>
        <div className={styles.actions}>
          {(query.q || query.condition) && (
            <Button variant="ghost" onClick={reset}>
              Xóa bộ lọc
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => {
              setQuery({ ...query, refresh: query.refresh + 1 });
            }}
          >
            <ArrowClockwise size={17} aria-hidden />
            Làm mới kho
          </Button>
        </div>
      </div>
      {error ? (
        <InlineAlert tone="danger" title="Chưa tải được kho máy">
          {error}{' '}
          <Button
            variant="secondary"
            onClick={() => {
              setQuery({ ...query, refresh: query.refresh + 1 });
            }}
          >
            Thử lại
          </Button>
        </InlineAlert>
      ) : loading ? (
        <div className={styles.catalogGrid} aria-label="Đang tải máy">
          {[1, 2, 3].map((id) => (
            <div className={styles.productCard} key={id}>
              <Skeleton height={180} />
              <Skeleton height={28} />
              <Skeleton height={24} width="70%" />
            </div>
          ))}
        </div>
      ) : rows.length ? (
        <div className={styles.catalogGrid}>
          {rows.map((row) => (
            <CatalogCard key={dealerText(row['inventoryUnitId'])} row={row} choose={choose} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <FunnelSimple size={36} aria-hidden />
          <h3>
            {query.q || query.condition ? 'Chưa tìm thấy máy phù hợp' : 'Chưa có máy mở bán đại lý'}
          </h3>
          <p>
            {query.q || query.condition
              ? 'Thử từ khóa ngắn hơn, mã máy hoặc bỏ bớt bộ lọc.'
              : 'Máy cần có giá đại lý hợp lệ, kiểm định đạt và chưa được giữ cho đơn khác.'}
          </p>
          {(query.q || query.condition) && (
            <Button variant="secondary" onClick={reset}>
              Xem toàn bộ kho
            </Button>
          )}
        </div>
      )}
      {(query.page > 1 || more) && (
        <div className={styles.pagination}>
          <Button
            variant="secondary"
            disabled={loading || query.page === 1}
            onClick={() => {
              setQuery({ ...query, page: query.page - 1 });
            }}
          >
            Trang trước
          </Button>
          <span>Trang {query.page}</span>
          <Button
            variant="secondary"
            disabled={loading || !more}
            onClick={() => {
              setQuery({ ...query, page: query.page + 1 });
            }}
          >
            Trang tiếp
          </Button>
        </div>
      )}
    </section>
  );
}

function CatalogCard({
  row,
  choose,
}: {
  row: DealerRecord;
  choose: (offer: DealerRecord) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const photo = dealerRecord(row['image']);
  const facts = dealerRecord(row['configuration']);
  const price = dealerText(row['dealerPrice']);
  const reference = dealerText(row['publicReferencePrice']);
  const difference =
    /^\d+$/.test(price) && /^\d+$/.test(reference)
      ? (BigInt(reference) - BigInt(price)).toString()
      : '';
  return (
    <article className={styles.productCard}>
      <div className={styles.productImage}>
        {photo['url'] && !imageFailed ? (
          <Image
            src={dealerText(photo['url'])}
            alt={dealerText(photo['altText']) || dealerText(row['productName'])}
            width={320}
            height={220}
            unoptimized
            onError={() => {
              setImageFailed(true);
            }}
          />
        ) : (
          <div className={styles.imageFallback}>
            <DeviceMobile size={66} weight="duotone" aria-hidden />
            <span>Ảnh máy đang cập nhật</span>
          </div>
        )}
        <span className={styles.stockBadge}>Sẵn hàng</span>
      </div>
      <div className={styles.productBody}>
        <span className={styles.inventoryCode}>{dealerText(row['inventoryCode'])}</span>
        <h3>{dealerText(row['productName'])}</h3>
        <p className={styles.muted}>{dealerText(row['variantName'])}</p>
        <div className={styles.deviceSpecs}>
          <span>
            <BatteryHigh size={17} aria-hidden />
            Pin {dealerText(facts['batteryHealthPercent']) || '—'}%
          </span>
          <span>Loại {dealerText(facts['conditionGrade']) || '—'}</span>
          <span>
            <ShieldCheck size={17} aria-hidden />
            {dealerText(row['warrantyDays'])} ngày
          </span>
        </div>
        <div className={styles.dealerPriceBlock}>
          <span>Giá đại lý</span>
          <strong>{dealerMoney(row['dealerPrice'])}</strong>
          <small>Giá web rePhone: {dealerMoney(row['publicReferencePrice'])}</small>
        </div>
        {difference && <p className={styles.saving}>Thấp hơn giá web {dealerMoney(difference)}</p>}
        <Button
          onClick={() => {
            choose(row);
          }}
        >
          Chọn máy này
          <ArrowRight size={18} aria-hidden />
        </Button>
      </div>
    </article>
  );
}
