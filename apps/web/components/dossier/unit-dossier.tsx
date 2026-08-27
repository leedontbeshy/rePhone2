import { ShieldCheckIcon, StorefrontIcon, TruckIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CommerceActions } from '@/app/commerce-actions';
import { ProductBreadcrumbs } from '@/components/catalog/product-detail-components';
import { Badge, Price, formatVnd } from '@/components/ui';
import type { ProductDetail, UsedIphoneDetail } from '@/lib/catalog-api';
import { ActualUnitGallery } from './actual-unit-gallery';
import { MobilePurchaseBar } from './mobile-purchase-bar';
import { PublicInspectionSummary } from './public-inspection-summary';
import { RelatedUnitOffers } from './related-unit-offers';
import { UnitColorOptions } from './unit-color-options';
import { UnitConditionSummary } from './unit-condition-summary';
import {
  availableColorOffers,
  discountPercent,
  relatedUnitOffers,
  storeAvailabilityLabel,
  unitConfigurationLabel,
} from './unit-dossier-presenters';
import { UnitSpecificationGroups } from './unit-specification-groups';
import styles from './dossier.module.css';

const PURCHASE_ACTION_ID = 'unit-purchase-actions';

interface UnitDossierProps {
  readonly detail: UsedIphoneDetail;
  readonly product: ProductDetail;
}

export function UnitDossier({ detail, product }: UnitDossierProps) {
  const { unit, variant } = detail;
  const canPurchase = unit.fulfillmentAvailability.pickup || unit.fulfillmentAvailability.shipping;
  const discount = discountPercent(unit.price.salePrice, unit.price.compareAtPrice);
  const colors = availableColorOffers(product, variant.id);
  const related = relatedUnitOffers(product, unit.inventoryCode);

  return (
    <div className={styles.page}>
      <ProductBreadcrumbs
        inventoryCode={unit.inventoryCode}
        productName={product.name}
        productSlug={product.slug}
      />

      <section className={styles.hero} aria-label="Thông tin máy đang bán">
        <header className={styles.productContext}>
          <div className={styles.statusRow}>
            <Badge>Grade {unit.conditionGrade}</Badge>
            {unit.batteryHealthPercent === null ||
            unit.batteryHealthPercent === undefined ? null : (
              <strong>Pin {String(unit.batteryHealthPercent)}%</strong>
            )}
          </div>
          <h1>{product.name}</h1>
          <p>{unitConfigurationLabel(detail, product)}</p>
        </header>

        <div className={styles.galleryColumn}>
          <ActualUnitGallery
            inventoryCode={unit.inventoryCode}
            media={unit.media}
            productName={product.name}
          />
        </div>

        <aside className={styles.purchaseRail} aria-label="Tóm tắt mua hàng">
          <UnitColorOptions
            currentVariantId={variant.id}
            offers={colors}
            productSlug={product.slug}
          />

          <div className={styles.priceBlock}>
            <Price amount={unit.price.salePrice} />
            {unit.price.compareAtPrice === undefined ? null : (
              <s>{formatVnd(unit.price.compareAtPrice)}</s>
            )}
            {discount === null || discount === 0 ? null : (
              <span className={styles.discountBadge}>-{String(discount)}%</span>
            )}
          </div>

          <dl className={styles.purchaseBenefits} aria-label="Quyền lợi và hình thức nhận hàng">
            <PurchaseBenefit
              icon={<ShieldCheckIcon size={22} />}
              label="Bảo hành"
              value={`${String(unit.warrantyDays)} ngày`}
            />
            <PurchaseBenefit
              icon={<StorefrontIcon size={22} />}
              label="Tại cửa hàng"
              value={storeAvailabilityLabel(
                unit.fulfillmentAvailability.pickup,
                unit.fulfillmentAvailability.shipping,
              )}
            />
            <PurchaseBenefit
              icon={<TruckIcon size={22} />}
              label="Giao hàng"
              value={unit.fulfillmentAvailability.shipping ? 'Có thể giao' : 'Chưa hỗ trợ'}
            />
          </dl>

          <div id={PURCHASE_ACTION_ID} className={styles.purchaseActions}>
            <CommerceActions
              itemType="IPHONE"
              inventoryCode={unit.inventoryCode}
              available={canPurchase}
            />
          </div>
          <UnitConditionSummary unit={unit} />
          <InventoryAuthorityNote
            pickup={unit.fulfillmentAvailability.pickup}
            shipping={unit.fulfillmentAvailability.shipping}
          />
        </aside>
      </section>

      <UnitSpecificationGroups detail={detail} product={product} />

      <PublicInspectionSummary checks={unit.functionalChecks} inventoryCode={unit.inventoryCode} />

      <RelatedUnitOffers offers={related} productName={product.name} productSlug={product.slug} />

      <MobilePurchaseBar
        available={canPurchase}
        inventoryCode={unit.inventoryCode}
        price={unit.price.salePrice}
        targetId={PURCHASE_ACTION_ID}
      />
    </div>
  );
}

function InventoryAuthorityNote({ pickup, shipping }: { pickup: boolean; shipping: boolean }) {
  if (!pickup && shipping) {
    return (
      <p className={styles.authorityNote}>
        <Link href="/store">Liên hệ cửa hàng</Link> để chuyển máy trước khi đến xem. Giá và tồn kho
        được kiểm tra lại khi xác nhận đơn.
      </p>
    );
  }

  return (
    <p className={styles.authorityNote}>
      Tồn kho và giá được kiểm tra lại khi bạn xem giỏ hàng và xác nhận đơn.
    </p>
  );
}

function PurchaseBenefit({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt>
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
