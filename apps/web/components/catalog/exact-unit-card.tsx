import { ArrowRightIcon, BatteryHighIcon, ShieldCheckIcon } from '@phosphor-icons/react/ssr';
import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { Badge, Price, formatVnd } from '@/components/ui';
import { fulfillmentSummary } from '@/lib/catalog-presenters';
import type { ModelUnitOffer } from '@/lib/model-unit-offers';
import { PublicMediaImage } from './public-media';
import styles from './exact-unit-card.module.css';

type Unit = components['schemas']['UsedIphoneCardDto'];

interface ExactUnitCardProps {
  readonly layout?: 'horizontal' | 'stacked';
  readonly idPrefix?: string;
  readonly colorHex?: ModelUnitOffer['colorHex'];
  readonly colorName?: ModelUnitOffer['colorName'];
  readonly productRamGb?: ModelUnitOffer['productRamGb'];
  readonly productName?: string;
  readonly productSlug: string;
  readonly storageCapacityGb?: ModelUnitOffer['storageCapacityGb'];
  readonly unit: Unit;
  readonly variantDisplayName?: string;
}

export function ExactUnitCard({
  layout = 'horizontal',
  idPrefix = 'unit-card',
  colorHex,
  colorName,
  productRamGb,
  productName,
  productSlug,
  storageCapacityGb,
  unit,
  variantDisplayName,
}: ExactUnitCardProps) {
  const href = `/products/${productSlug}/units/${unit.inventoryCode}`;
  const safeColorHex = normalizeColorHex(colorHex);
  const headingId = `${idPrefix}-${unit.inventoryCode}`;
  const variantName = variantDisplayName?.trim() ?? '';
  const modelName = productName?.trim() ?? '';
  const identity =
    modelName.length > 0 && !includesLabel(variantName, modelName)
      ? `${modelName} ${variantName}`.trim()
      : variantName || modelName || `Máy ${unit.inventoryCode}`;
  const storageLabel =
    storageCapacityGb === null || storageCapacityGb === undefined
      ? null
      : `${String(storageCapacityGb)} GB`;
  const headingWithStorage =
    storageLabel !== null && !includesLabel(identity, storageLabel)
      ? `${identity} · ${storageLabel}`
      : identity;
  const heading =
    colorName != null &&
    colorName.trim().length > 0 &&
    !includesLabel(headingWithStorage, colorName)
      ? `${headingWithStorage} · ${colorName}`
      : headingWithStorage;
  const showRam =
    productRamGb != null &&
    !includesLabel(heading, `${String(productRamGb)} GB RAM`) &&
    !includesLabel(heading, `RAM ${String(productRamGb)} GB`);

  return (
    <article aria-labelledby={headingId} className={styles.unitCard} data-layout={layout}>
      <Link
        aria-label={`Xem máy ${unit.inventoryCode}`}
        className={styles.unitMediaLink}
        href={href}
      >
        <PublicMediaImage
          className={styles.unitMedia}
          fallbackLabel={`Chưa có ảnh máy ${unit.inventoryCode}`}
          media={unit.thumbnail}
        />
      </Link>
      <div className={styles.unitCardBody}>
        <header className={styles.cardIdentity}>
          <p className={styles.actualUnitLabel}>Ảnh thật · Mã máy {unit.inventoryCode}</p>
          <h3 className={styles.variantName} id={headingId}>
            {safeColorHex === null ? null : (
              <span
                aria-hidden="true"
                className={styles.colorSwatch}
                style={{ backgroundColor: safeColorHex }}
              />
            )}
            {heading}
          </h3>
        </header>
        <div className={styles.cardMeta}>
          <Badge>Ngoại hình loại {unit.conditionGrade}</Badge>
          {unit.batteryHealthPercent === null || unit.batteryHealthPercent === undefined ? null : (
            <span className={styles.batteryMetric}>
              <BatteryHighIcon aria-hidden="true" size={17} weight="bold" />
              Pin {unit.batteryHealthPercent}%
            </span>
          )}
          {showRam ? (
            <dl className={styles.configuration} aria-label="Cấu hình máy">
              <div>
                <dt>RAM</dt>
                <dd>{productRamGb} GB</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className={styles.unitPrice}>
          <Price amount={unit.price.salePrice} />
          {unit.price.compareAtPrice === undefined ? null : (
            <s>{formatVnd(unit.price.compareAtPrice)}</s>
          )}
        </div>

        <div className={styles.cardFooter}>
          <dl className={styles.serviceFacts}>
            <div className={styles.warrantyFact}>
              <dt>
                <ShieldCheckIcon aria-hidden="true" size={16} weight="bold" />
                Bảo hành
              </dt>
              <dd>{unit.warrantyDays} ngày</dd>
            </div>
            <div>
              <dt className={styles.srOnly}>Nhận hàng</dt>
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
      </div>
    </article>
  );
}

function includesLabel(value: string, label: string): boolean {
  const normalize = (text: string) => text.replaceAll(/\s+/g, '').toLocaleLowerCase('vi-VN');
  return normalize(value).includes(normalize(label));
}

function normalizeColorHex(value: string | null | undefined): string | null {
  if (value === null || value === undefined || !/^#[\dA-Fa-f]{6}$/.test(value)) return null;
  return value;
}
