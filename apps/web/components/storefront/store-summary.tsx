import Link from 'next/link';
import { toMapSearchHref, toPhoneHref } from '@/lib/contact-links';
import type { PublicStore } from '@/lib/public-store-api';
import styles from './store-summary.module.css';

interface StoreSummaryProps {
  readonly store: PublicStore;
  readonly compact?: boolean;
}

export function StoreSummary({ store, compact = false }: Readonly<StoreSummaryProps>) {
  const phoneHref = toPhoneHref(store.storePhone);
  const mapHref = toMapSearchHref(store.storeAddress);
  const pickupUsesStoreAddress =
    store.pickup.address.trim().toLocaleLowerCase('vi-VN') ===
    store.storeAddress.trim().toLocaleLowerCase('vi-VN');

  return (
    <article className={styles.summary} data-compact={compact || undefined}>
      <header className={styles.heading}>
        <p className={styles.label}>Cửa hàng rePhone</p>
        {compact ? <h3>{store.storeName}</h3> : <h2>{store.storeName}</h2>}
        <p>Liên hệ cửa hàng, xem địa chỉ và chuẩn bị trước khi đến nhận máy.</p>
      </header>

      <div className={styles.information}>
        <dl className={styles.details}>
          <div>
            <dt>Điện thoại</dt>
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
            <dt>Điểm nhận máy</dt>
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
            <dt>Thời gian giữ máy</dt>
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
          ) : mapHref === null ? null : (
            <a
              className={styles.secondaryAction}
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mở bản đồ
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function StoreUnavailable() {
  return (
    <section className={styles.unavailable} role="status" aria-labelledby="store-unavailable-title">
      <p className={styles.label}>Thông tin cửa hàng</p>
      <h2 id="store-unavailable-title">Chưa tải được thông tin cửa hàng</h2>
      <p>
        Hiện chưa thể tải địa chỉ và thông tin nhận máy. Bạn vẫn có thể xem danh mục sản phẩm rồi
        thử lại sau.
      </p>
      <div className={styles.actions}>
        <Link className={styles.primaryAction} href="/store">
          Thử lại
        </Link>
        <Link className={styles.secondaryAction} href="/products">
          Xem danh mục sản phẩm
        </Link>
      </div>
    </section>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${String(hours)} giờ`;
  }
  return `${String(minutes)} phút`;
}
