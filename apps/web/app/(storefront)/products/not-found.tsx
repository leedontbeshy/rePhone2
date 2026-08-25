import Link from 'next/link';
import styles from '@/components/catalog/catalog.module.css';

export default function ProductNotFound() {
  return (
    <section className={styles.emptyState}>
      <p className={styles.eyebrow}>Không tìm thấy</p>
      <h1>Sản phẩm không còn công khai</h1>
      <p>Sản phẩm có thể đã ngừng bán hoặc đường dẫn không còn hợp lệ.</p>
      <Link className={styles.cardAction} href="/products">
        Quay lại catalog
      </Link>
    </section>
  );
}
