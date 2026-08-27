import Link from 'next/link';
import type { ProductListItem } from '@/lib/catalog-api';
import { Price, StatusChip } from '@/components/ui';
import { PublicMediaImage } from './public-media';
import styles from './catalog.module.css';

export function AccessoryProductCard({ product }: Readonly<{ product: ProductListItem }>) {
  const fromPrice = product.inStock ? product.price.fromPrice : undefined;

  return (
    <article className={styles.productCard}>
      <Link className={styles.productMediaLink} href={`/products/${product.slug}`}>
        <span className={styles.mediaLabel}>Ảnh sản phẩm</span>
        <PublicMediaImage
          className={styles.productMedia}
          fallbackLabel={`Chưa có ảnh ${product.name}`}
          media={product.coverMedia}
        />
      </Link>
      <div className={styles.productCardBody}>
        <div className={styles.cardMeta}>
          <span>Phụ kiện</span>
          <StatusChip
            label={fromPrice === undefined ? 'Tạm hết hàng' : 'Còn hàng'}
            tone={fromPrice === undefined ? 'neutral' : 'success'}
          />
        </div>
        <h2 className={styles.productTitle}>
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h2>
        <div className={styles.priceLine}>
          {fromPrice === undefined ? (
            <strong>Tạm hết hàng</strong>
          ) : (
            <>
              <span>Giá từ</span>
              <Price amount={fromPrice} />
            </>
          )}
        </div>
        {product.colorOptions.length > 0 ? (
          <p className={styles.optionLine}>{product.colorOptions.join(' · ')}</p>
        ) : null}
        <Link className={styles.cardAction} href={`/products/${product.slug}`}>
          Xem phụ kiện
        </Link>
      </div>
    </article>
  );
}
