import { ArrowRightIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { ExactUnitCard } from '@/components/catalog/exact-unit-card';
import type { RelatedUnitOffer } from './unit-dossier-presenters';
import styles from './dossier.module.css';

interface RelatedUnitOffersProps {
  readonly offers: readonly RelatedUnitOffer[];
  readonly productName: string;
  readonly productSlug: string;
  readonly productRamGb?: number | null | undefined;
}

export function RelatedUnitOffers({
  offers,
  productName,
  productSlug,
  productRamGb,
}: RelatedUnitOffersProps) {
  if (offers.length === 0) return null;

  return (
    <section className={styles.relatedSection} aria-labelledby="related-units-title">
      <header className={styles.relatedHeader}>
        <div>
          <p className={styles.eyebrow}>Lựa chọn khác của {productName}</p>
          <h2 id="related-units-title">Máy cùng dòng đang bán</h2>
        </div>
        <Link href={`/products/${productSlug}`}>
          Xem tất cả
          <ArrowRightIcon aria-hidden="true" size={18} />
        </Link>
      </header>
      <div className={styles.relatedRail}>
        {offers.map(({ unit, variant }) => (
          <ExactUnitCard
            colorHex={variant.colorHex}
            colorName={variant.colorName}
            key={unit.inventoryCode}
            productName={productName}
            productRamGb={productRamGb}
            productSlug={productSlug}
            storageCapacityGb={variant.storageCapacityGb}
            unit={unit}
            variantDisplayName={variant.displayName}
          />
        ))}
      </div>
    </section>
  );
}
