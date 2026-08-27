import Link from 'next/link';
import type { RelatedUnitOffer } from './unit-dossier-presenters';
import { safeColorHex } from './unit-dossier-presenters';
import styles from './dossier.module.css';

interface UnitColorOptionsProps {
  readonly currentVariantId: string;
  readonly offers: readonly RelatedUnitOffer[];
  readonly productSlug: string;
}

export function UnitColorOptions({ currentVariantId, offers, productSlug }: UnitColorOptionsProps) {
  if (offers.length === 0) return null;

  return (
    <div className={styles.colorOptions}>
      <p>
        Màu sắc:{' '}
        <strong>
          {offers.find(({ variant }) => variant.id === currentVariantId)?.variant.colorName ??
            'Theo máy'}
        </strong>
      </p>
      <div aria-label="Các màu đang có máy bán" className={styles.colorOptionList}>
        {offers.map(({ unit, variant }) => {
          const current = variant.id === currentVariantId;
          const label = variant.colorName ?? 'Màu chưa cập nhật';
          const color = safeColorHex(variant.colorHex);
          return current ? (
            <span
              aria-current="true"
              aria-label={`${label}, đang chọn`}
              className={styles.colorOption}
              key={variant.id}
              role="img"
              style={{ backgroundColor: color }}
              title={label}
            />
          ) : (
            <Link
              aria-label={`Xem máy màu ${label}`}
              className={styles.colorOption}
              href={`/products/${productSlug}/units/${unit.inventoryCode}`}
              key={variant.id}
              style={{ backgroundColor: color }}
              title={label}
            />
          );
        })}
      </div>
    </div>
  );
}
