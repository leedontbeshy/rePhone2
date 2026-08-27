import {
  ArrowRightIcon,
  BatteryHighIcon,
  DeviceMobileIcon,
  HardDriveIcon,
} from '@phosphor-icons/react/ssr';
import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { Badge, Price, formatVnd } from '@/components/ui';
import { fulfillmentSummary } from '@/lib/catalog-presenters';
import type { ModelUnitOffer } from '@/lib/model-unit-offers';
import { PublicMediaImage } from './public-media';
import styles from './exact-unit-card.module.css';

type Unit = components['schemas']['UsedIphoneCardDto'];

interface ExactUnitCardProps {
  readonly colorHex?: ModelUnitOffer['colorHex'];
  readonly colorName?: ModelUnitOffer['colorName'];
  readonly productRamGb?: ModelUnitOffer['productRamGb'];
  readonly productSlug: string;
  readonly storageCapacityGb?: ModelUnitOffer['storageCapacityGb'];
  readonly unit: Unit;
  readonly variantDisplayName?: string;
}

export function ExactUnitCard({
  colorHex,
  colorName,
  productRamGb,
  productSlug,
  storageCapacityGb,
  unit,
  variantDisplayName,
}: ExactUnitCardProps) {
  const href = `/products/${productSlug}/units/${unit.inventoryCode}`;
  const safeColorHex = normalizeColorHex(colorHex);
  const headingId = `unit-card-${unit.inventoryCode}`;
  const heading = variantDisplayName ?? `Máy ${unit.inventoryCode}`;

  return (
    <article aria-labelledby={headingId} className={styles.unitCard}>
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
          <Badge>Grade {unit.conditionGrade}</Badge>
          {unit.batteryHealthPercent === null || unit.batteryHealthPercent === undefined ? null : (
            <span className={styles.batteryMetric}>
              <BatteryHighIcon aria-hidden="true" size={17} weight="bold" />
              Pin {unit.batteryHealthPercent}%
            </span>
          )}
        </div>

        {colorName === null || colorName === undefined ? null : (
          <p className={styles.colorLine}>
            <span
              aria-hidden="true"
              className={styles.colorSwatch}
              style={safeColorHex === null ? undefined : { backgroundColor: safeColorHex }}
            />
            {colorName}
          </p>
        )}

        <h3 className={styles.variantName} id={headingId}>
          {heading}
        </h3>
        <dl className={styles.configuration} aria-label="Cấu hình máy">
          {storageCapacityGb === null || storageCapacityGb === undefined ? null : (
            <div>
              <dt>
                <HardDriveIcon aria-hidden="true" size={18} weight="bold" />
                <span>Dung lượng</span>
              </dt>
              <dd>{storageCapacityGb} GB</dd>
            </div>
          )}
          {productRamGb === null || productRamGb === undefined ? null : (
            <div>
              <dt>
                <DeviceMobileIcon aria-hidden="true" size={18} weight="bold" />
                <span>RAM</span>
              </dt>
              <dd>{productRamGb} GB</dd>
            </div>
          )}
        </dl>

        <div className={styles.unitPrice}>
          <Price amount={unit.price.salePrice} />
          {unit.price.compareAtPrice === undefined ? null : (
            <s>{formatVnd(unit.price.compareAtPrice)}</s>
          )}
        </div>

        <dl className={styles.serviceFacts}>
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
        <Link
          aria-label={`Xem ${heading}, mã máy ${unit.inventoryCode}`}
          className={styles.cardAction}
          href={href}
        >
          Xem máy này
          <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
        </Link>
      </div>
    </article>
  );
}

function normalizeColorHex(value: string | null | undefined): string | null {
  if (value === null || value === undefined || !/^#[\dA-Fa-f]{6}$/.test(value)) return null;
  return value;
}
