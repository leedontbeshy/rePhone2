import { ArrowRightIcon, BatteryMediumIcon, HardDriveIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { Price, formatVnd } from '@/components/ui';
import type { RelatedUnitOffer } from './unit-dossier-presenters';
import { safeColorHex } from './unit-dossier-presenters';
import styles from './dossier.module.css';

interface RelatedUnitOffersProps {
  readonly offers: readonly RelatedUnitOffer[];
  readonly productName: string;
  readonly productSlug: string;
}

export function RelatedUnitOffers({ offers, productName, productSlug }: RelatedUnitOffersProps) {
  if (offers.length === 0) return null;

  return (
    <section className={styles.relatedSection} aria-labelledby="related-units-title">
      <header className={styles.relatedHeader}>
        <div>
          <p className={styles.eyebrow}>Lựa chọn khác</p>
          <h2 id="related-units-title">Máy cùng dòng đang bán</h2>
        </div>
        <Link href={`/products/${productSlug}`}>
          Xem tất cả
          <ArrowRightIcon aria-hidden="true" size={18} />
        </Link>
      </header>
      <div className={styles.relatedRail}>
        {offers.map(({ unit, variant }) => {
          const href = `/products/${productSlug}/units/${unit.inventoryCode}`;
          const headingId = `related-unit-${unit.inventoryCode}`;
          return (
            <article
              aria-labelledby={headingId}
              className={styles.relatedCard}
              key={unit.inventoryCode}
            >
              <Link className={styles.relatedMediaLink} href={href}>
                <span className={styles.relatedGrade}>Ngoại hình loại {unit.conditionGrade}</span>
                <PublicMediaImage
                  className={styles.relatedMedia}
                  fallbackLabel={`Chưa có ảnh thật của ${productName}, mã máy ${unit.inventoryCode}`}
                  media={unit.thumbnail}
                />
              </Link>
              <div className={styles.relatedBody}>
                <div className={styles.relatedMeta}>
                  <span>
                    <span
                      aria-hidden="true"
                      className={styles.colorDot}
                      style={{ backgroundColor: safeColorHex(variant.colorHex) }}
                    />
                    {variant.colorName ?? 'Màu chưa cập nhật'}
                  </span>
                  {unit.batteryHealthPercent === null ||
                  unit.batteryHealthPercent === undefined ? null : (
                    <span>
                      <BatteryMediumIcon aria-hidden="true" size={17} />
                      Pin {String(unit.batteryHealthPercent)}%
                    </span>
                  )}
                </div>
                <h3 id={headingId}>{variant.displayName}</h3>
                <div className={styles.relatedStorage}>
                  <HardDriveIcon aria-hidden="true" size={17} />
                  <span>
                    {variant.storageCapacityGb === null || variant.storageCapacityGb === undefined
                      ? 'Dung lượng theo cấu hình'
                      : `${String(variant.storageCapacityGb)} GB`}
                  </span>
                </div>
                <div className={styles.relatedPrice}>
                  <Price amount={unit.price.salePrice} />
                  {unit.price.compareAtPrice === undefined ? null : (
                    <s>{formatVnd(unit.price.compareAtPrice)}</s>
                  )}
                </div>
                <dl className={styles.relatedWarranty}>
                  <dt>Bảo hành</dt>
                  <dd>{String(unit.warrantyDays)} ngày</dd>
                </dl>
                <Link
                  aria-label={`Xem ${variant.displayName}, mã máy ${unit.inventoryCode}`}
                  className={styles.relatedAction}
                  href={href}
                >
                  Xem máy này
                  <ArrowRightIcon aria-hidden="true" size={17} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
