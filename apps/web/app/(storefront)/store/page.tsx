import type { Metadata } from 'next';
import { StoreSummary, StoreUnavailable } from '@/components/storefront/store-summary';
import { getPublicStore } from '@/lib/public-store-api';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Cửa hàng | rePhone',
  description: 'Thông tin liên hệ và điểm nhận hàng công khai của rePhone.',
};

export default async function StorePage() {
  try {
    const store = await getPublicStore();
    return (
      <div className={styles.page}>
        <header className={styles.heading}>
          <p>Cửa hàng</p>
          <h1>Thông tin liên hệ và pickup</h1>
          <span>Tên, số điện thoại, địa chỉ và thông tin điểm nhận hàng hiện hành.</span>
        </header>
        <StoreSummary store={store} />
        <aside className={styles.note} aria-labelledby="pickup-note-title">
          <h2 id="pickup-note-title">Trước khi đến nhận máy</h2>
          <p>
            Khả năng pickup của từng máy được hiển thị trong trang chi tiết máy và được kiểm tra lại
            khi checkout.
          </p>
        </aside>
      </div>
    );
  } catch {
    return (
      <div className={styles.page}>
        <header className={styles.heading}>
          <p>Cửa hàng</p>
          <h1>Thông tin liên hệ và pickup</h1>
        </header>
        <StoreUnavailable />
      </div>
    );
  }
}
