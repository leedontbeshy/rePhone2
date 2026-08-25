import Link from 'next/link';
import type { ProductListItem } from '@/lib/catalog-api';
import { Price, StatusChip } from '@/components/ui';
import { PublicMediaImage } from './public-media';
import styles from './catalog.module.css';

export function ProductCard({ product }: Readonly<{ product: ProductListItem }>) {
  return (
    <article className={styles.productCard}>
      <Link className={styles.productMediaLink} href={`/products/${product.slug}`}>
        <span className={styles.mediaLabel}>Ảnh minh họa model</span>
        <PublicMediaImage
          className={styles.productMedia}
          fallbackLabel={`Chưa có ảnh minh họa ${product.name}`}
          media={product.coverMedia}
        />
      </Link>
      <div className={styles.productCardBody}>
        <div className={styles.cardMeta}>
          <span>{product.productType === 'IPHONE' ? 'iPhone đã qua sử dụng' : 'Phụ kiện'}</span>
          <StatusChip
            label={product.inStock ? 'Còn lựa chọn' : 'Tạm hết hàng'}
            tone={product.inStock ? 'success' : 'neutral'}
          />
        </div>
        <div>
          <h2 className={styles.productTitle}>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </h2>
          {product.releaseYear === undefined || product.releaseYear === null ? null : (
            <p className={styles.secondaryText}>Ra mắt {product.releaseYear}</p>
          )}
        </div>
        <div className={styles.priceLine}>
          <span>Từ</span>
          {product.price.fromPrice === undefined ? (
            <strong>Liên hệ</strong>
          ) : (
            <Price amount={product.price.fromPrice} />
          )}
        </div>
        {product.storageOptions.length > 0 ? (
          <p className={styles.optionLine}>
            {product.storageOptions.map((size) => `${String(size)} GB`).join(' · ')}
          </p>
        ) : null}
        {product.colorOptions.length > 0 ? (
          <p className={styles.optionLine}>{product.colorOptions.join(' · ')}</p>
        ) : null}
        <Link className={styles.cardAction} href={`/products/${product.slug}`}>
          Xem model và từng máy
        </Link>
      </div>
    </article>
  );
}
