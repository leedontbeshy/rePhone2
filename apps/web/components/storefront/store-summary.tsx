import Link from 'next/link';
import type { PublicStore } from '@/lib/public-store-api';
import styles from './store-summary.module.css';

interface StoreSummaryProps {
  readonly store: PublicStore;
  readonly compact?: boolean;
}

export function StoreSummary({ store, compact = false }: Readonly<StoreSummaryProps>) {
  const phoneHref = toPhoneHref(store.storePhone);
  const pickupUsesStoreAddress =
    store.pickup.address.trim().toLocaleLowerCase('vi-VN') ===
    store.storeAddress.trim().toLocaleLowerCase('vi-VN');

  return (
    <article className={styles.summary} data-compact={compact || undefined}>
      <header className={styles.heading}>
        <p className={styles.label}>Cửa hàng rePhone</p>
        {compact ? <h3>{store.storeName}</h3> : <h2>{store.storeName}</h2>}
        <p>Thông tin liên hệ và điểm nhận hàng hiện hành.</p>
      </header>

      <dl className={styles.details}>
        <div>
          <dt>Liên hệ</dt>
          <dd>
            {phoneHref === null ? store.storePhone : <a href={phoneHref}>{store.storePhone}</a>}
          </dd>
        </div>
        <div>
          <dt>Địa chỉ cửa hàng</dt>
          <dd>
            <address>{store.storeAddress}</address>
          </dd>
        </div>
        <div>
          <dt>Điểm nhận hàng</dt>
          <dd>
            <strong>{store.pickup.locationName}</strong>
            {pickupUsesStoreAddress ? (
              <span>Cùng địa chỉ cửa hàng</span>
            ) : (
              <address>{store.pickup.address}</address>
            )}
          </dd>
        </div>
        <div>
          <dt>Thời gian giữ đơn pickup</dt>
          <dd>{formatMinutes(store.pickup.holdMinutes)}</dd>
        </div>
      </dl>

      <div className={styles.actions}>
        {phoneHref === null ? null : (
          <a className={styles.primaryAction} href={phoneHref}>
            Gọi cửa hàng
          </a>
        )}
        {compact ? (
          <Link className={styles.secondaryAction} href="/store">
            Xem thông tin cửa hàng
          </Link>
        ) : (
          <Link className={styles.secondaryAction} href="/products">
            Xem máy đang bán
          </Link>
        )}
      </div>
    </article>
  );
}

export function StoreUnavailable() {
  return (
    <section className={styles.unavailable} role="status" aria-labelledby="store-unavailable-title">
      <p className={styles.label}>Thông tin cửa hàng</p>
      <h2 id="store-unavailable-title">Cửa hàng đang tạm không khả dụng</h2>
      <p>
        Hệ thống chưa thể tải địa chỉ và thông tin pickup. Bạn vẫn có thể xem từng máy đang bán và
        quay lại trang này sau.
      </p>
      <div className={styles.actions}>
        <Link className={styles.primaryAction} href="/store">
          Thử tải lại
        </Link>
        <Link className={styles.secondaryAction} href="/products">
          Xem catalog
        </Link>
      </div>
    </section>
  );
}

function toPhoneHref(phone: string): string | null {
  const normalized = phone.trim().replace(/[^+\d]/g, '');
  return normalized.length === 0 ? null : `tel:${normalized}`;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${String(hours)} giờ`;
  }
  return `${String(minutes)} phút`;
}
