import type { Metadata } from 'next';
import { StoreContactChannels } from '@/components/storefront/store-contact-channels';
import { StoreSummary, StoreUnavailable } from '@/components/storefront/store-summary';
import { getPublicStore, type PublicStore } from '@/lib/public-store-api';
import { getStorefrontFooterConfig } from '@/lib/storefront-footer-config';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Cửa hàng | rePhone',
  description: 'Thông tin liên hệ và điểm nhận hàng công khai của rePhone.',
};

export default async function StorePage() {
  let store: PublicStore | null = null;
  try {
    store = await getPublicStore();
  } catch {
    // Configured email and social channels remain available during a store-provider failure.
  }
  const contactConfig = getStorefrontFooterConfig();

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <p>Cửa hàng</p>
        <h1>Thông tin cửa hàng</h1>
        <span>Liên hệ, xem địa chỉ và thông tin nhận máy tại rePhone.</span>
      </header>
      {store === null ? <StoreUnavailable /> : <StoreSummary store={store} />}
      <StoreContactChannels config={contactConfig} />
      {store === null ? null : (
        <aside className={styles.note} aria-labelledby="store-visit-note-title">
          <h2 id="store-visit-note-title">Trước khi đến nhận máy</h2>
          <p>
            Tình trạng nhận tại cửa hàng của từng máy được hiển thị trên trang chi tiết và xác nhận
            lại khi đặt hàng.
          </p>
        </aside>
      )}
    </div>
  );
}
