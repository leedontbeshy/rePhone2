'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import styles from '@/components/catalog/catalog.module.css';

export default function ProductNotFound() {
  const params = useParams<{
    inventoryCode?: string | string[];
    slug?: string | string[];
  }>();
  const inventoryCode = firstParam(params.inventoryCode);
  const slug = firstParam(params.slug);
  const isExactUnit = inventoryCode !== undefined && slug !== undefined;

  return (
    <section className={styles.emptyState}>
      <p className={styles.eyebrow}>{isExactUnit ? 'Máy không còn sẵn sàng' : 'Không tìm thấy'}</p>
      <h1>{isExactUnit ? 'Chiếc máy này hiện không còn bán' : 'Sản phẩm không còn công khai'}</h1>
      <p>
        {isExactUnit
          ? `Mã máy ${inventoryCode} có thể đã được bán hoặc tạm ngừng công khai.`
          : 'Sản phẩm có thể đã ngừng bán hoặc đường dẫn không còn hợp lệ.'}
      </p>
      <Link className={styles.cardAction} href={isExactUnit ? `/products/${slug}` : '/products'}>
        {isExactUnit ? 'Xem các máy cùng dòng' : 'Quay lại danh mục'}
      </Link>
    </section>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
