import { CaretRightIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { formatVnd, Price } from '@/components/ui';
import type { IphoneModelSummary } from '@/lib/iphone-model-groups';
import { PublicMediaImage } from './public-media';
import styles from './iphone-model-card.module.css';

interface IphoneModelCardProps {
  readonly headingLevel?: 2 | 3;
  readonly priority?: boolean;
  readonly product: IphoneModelSummary;
}

export function IphoneModelCard({
  headingLevel = 3,
  priority = false,
  product,
}: Readonly<IphoneModelCardProps>) {
  const fromPrice = product.inStock ? product.fromPrice : undefined;
  const availabilityLabel =
    fromPrice === undefined ? 'Tạm hết máy' : `Giá từ ${formatVnd(fromPrice)}`;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <article className={styles.card}>
      <Link
        className={styles.cardLink}
        href={`/products/${product.slug}`}
        prefetch={false}
        aria-label={`${product.name} — ${availabilityLabel}`}
      >
        <div className={styles.mediaStage}>
          <PublicMediaImage
            fallbackLabel={`Chưa có ảnh đại diện cho ${product.name}`}
            media={product.coverMedia}
            priority={priority}
          />
        </div>
        <div className={styles.body}>
          <Heading className={styles.title}>{product.name}</Heading>
          <div className={styles.priceRow}>
            {fromPrice === undefined ? (
              <span className={styles.soldOut}>Tạm hết máy</span>
            ) : (
              <span className={styles.price}>
                <span>Giá từ</span>
                <Price amount={fromPrice} />
              </span>
            )}
            <CaretRightIcon aria-hidden="true" size={20} weight="bold" />
          </div>
        </div>
      </Link>
    </article>
  );
}
