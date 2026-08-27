'use client';

import styles from '@/components/catalog/catalog.module.css';

export default function ProductsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className={styles.errorState}>
      <h1>Không thể tải sản phẩm</h1>
      <p>Dịch vụ catalog đang tạm gián đoạn. Vui lòng thử lại sau ít phút.</p>
      <button className={styles.applyFilter} type="button" onClick={reset}>
        Thử lại
      </button>
    </section>
  );
}
