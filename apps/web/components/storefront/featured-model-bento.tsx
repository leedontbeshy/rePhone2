import { CaretRightIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { Price, formatVnd } from '@/components/ui';
import { classNames } from '@/components/ui/class-names';
import type { IphoneModelSummary } from '@/lib/iphone-model-groups';
import { modelStudioArt } from '@/lib/model-studio-art';
import styles from './featured-model-bento.module.css';

export function FeaturedModelBento({
  products,
}: Readonly<{ products: readonly IphoneModelSummary[] }>) {
  const campaigns = [18, 17, 16].map((generation) => {
    const product =
      products.find((item) => item.slug === `iphone-${String(generation)}`) ??
      products.find((item) => item.slug === `iphone-${String(generation)}-pro`);
    return { generation, product };
  });
  return (
    <section className={styles.bento} aria-label="Dòng iPhone nổi bật" data-count={3}>
      {campaigns.map(({ generation, product }, index) => {
        const name = product?.name ?? `iPhone ${String(generation)}`;
        const art = modelStudioArt(`iphone-${String(generation)}`);
        const fromPrice = product?.inStock === true ? product.fromPrice : undefined;
        const available =
          fromPrice === undefined ? 'Khám phá dòng máy' : `Giá từ ${formatVnd(fromPrice)}`;
        return (
          <article
            className={classNames(styles.tile, index === 0 && styles.featured)}
            key={generation}
          >
            <Link
              href={
                product === undefined
                  ? `/products?q=${encodeURIComponent(name)}`
                  : `/products/${product.slug}`
              }
              className={styles.tileLink}
              aria-label={`${name} — ${available}`}
              prefetch={false}
            >
              <PublicMediaImage
                className={classNames(styles.art, art === undefined && styles.catalogArt)}
                fallbackLabel={`Chưa có ảnh minh họa ${name}`}
                media={art ?? product?.coverMedia}
                priority={index === 0}
              />
              <div className={styles.copy}>
                <h2>{name}</h2>
                {fromPrice === undefined ? (
                  <p className={styles.soldOut}>Khám phá dòng máy</p>
                ) : (
                  <p className={styles.price}>
                    <span>Giá từ</span>
                    <Price amount={fromPrice} />
                  </p>
                )}
                <span className={styles.action}>
                  Xem dòng máy
                  <CaretRightIcon aria-hidden="true" size={20} weight="bold" />
                </span>
              </div>
            </Link>
          </article>
        );
      })}
    </section>
  );
}
