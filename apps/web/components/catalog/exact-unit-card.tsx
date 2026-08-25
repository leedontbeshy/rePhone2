import Link from 'next/link';
import type { components } from '@rephone/api-client';
import { Price, StatusChip } from '@/components/ui';
import { fulfillmentSummary } from '@/lib/catalog-presenters';
import { PublicMediaImage } from './public-media';
import styles from './catalog.module.css';

type Unit = components['schemas']['UsedIphoneCardDto'];

export function ExactUnitCard({ productSlug, unit }: { productSlug: string; unit: Unit }) {
  const href = `/products/${productSlug}/units/${unit.inventoryCode}`;
  return (
    <article className={styles.unitCard}>
      <Link className={styles.unitMediaLink} href={href}>
        <span className={styles.actualUnitLabel}>Ảnh thật · Mã máy {unit.inventoryCode}</span>
        <PublicMediaImage
          className={styles.unitMedia}
          fallbackLabel={`Chưa có ảnh máy ${unit.inventoryCode}`}
          media={unit.thumbnail}
        />
      </Link>
      <div className={styles.unitCardBody}>
        <div className={styles.cardMeta}>
          <StatusChip label={`Grade ${unit.conditionGrade}`} tone="neutral" />
          {unit.batteryHealthPercent === null || unit.batteryHealthPercent === undefined ? null : (
            <span>Pin {unit.batteryHealthPercent}%</span>
          )}
        </div>
        <div className={styles.unitPrice}>
          <Price amount={unit.price.salePrice} />
          {unit.price.compareAtPrice === undefined ? null : (
            <s>{new Intl.NumberFormat('vi-VN').format(BigInt(unit.price.compareAtPrice))} ₫</s>
          )}
        </div>
        <dl className={styles.unitFacts}>
          <div>
            <dt>Bảo hành</dt>
            <dd>{unit.warrantyDays} ngày</dd>
          </div>
          <div>
            <dt>Nhận hàng</dt>
            <dd>
              {fulfillmentSummary(
                unit.fulfillmentAvailability.pickup,
                unit.fulfillmentAvailability.shipping,
              )}
            </dd>
          </div>
        </dl>
        <Link className={styles.cardAction} href={href}>
          Xem máy này
        </Link>
      </div>
    </article>
  );
}
