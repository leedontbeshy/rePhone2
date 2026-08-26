import {
  BarcodeIcon,
  BatteryMediumIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  CpuIcon,
  DeviceMobileIcon,
  GlobeHemisphereWestIcon,
  HardDriveIcon,
  LockOpenIcon,
  MemoryIcon,
  MinusCircleIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  SimCardIcon,
  StorefrontIcon,
  TruckIcon,
  WarningCircleIcon,
  WrenchIcon,
  XCircleIcon,
} from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';
import { CommerceActions } from '@/app/commerce-actions';
import {
  ProductBreadcrumbs,
  ProductSpecGrid,
  ProductTrustCallout,
  type ProductSpecItem,
} from '@/components/catalog/product-detail-components';
import { Badge, Price, StatusChip, formatVnd } from '@/components/ui';
import type { ProductDetail, UsedIphoneDetail } from '@/lib/catalog-api';
import {
  catalogLabel,
  countAcceptableChecks,
  fulfillmentSummary,
  groupFunctionalChecks,
} from '@/lib/catalog-presenters';
import { ActualUnitGallery } from './actual-unit-gallery';
import { MobilePurchaseBar } from './mobile-purchase-bar';
import { RelatedUnitOffers } from './related-unit-offers';
import { UnitColorOptions } from './unit-color-options';
import {
  availableColorOffers,
  discountPercent,
  relatedUnitOffers,
  unitConfigurationLabel,
} from './unit-dossier-presenters';
import styles from './dossier.module.css';

const PURCHASE_ACTION_ID = 'unit-purchase-actions';
const INSPECTION_SECTION_ID = 'inspection-dossier';

interface UnitDossierProps {
  readonly detail: UsedIphoneDetail;
  readonly product: ProductDetail;
}

export function UnitDossier({ detail, product }: UnitDossierProps) {
  const { unit, variant } = detail;
  const acceptableChecks = countAcceptableChecks(unit.functionalChecks);
  const checkGroups = groupFunctionalChecks(unit.functionalChecks);
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
              value={unit.fulfillmentAvailability.pickup ? 'Có thể nhận' : 'Chưa hỗ trợ'}
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
          <p className={styles.authorityNote}>
            Tồn kho và giá được kiểm tra lại khi bạn xem giỏ hàng và checkout.
          </p>
        </aside>
      </section>

      <ProductSpecGrid
        items={unitSpecItems(detail, product)}
        title="Thông tin chi tiết"
        variant="rows"
      />

      <section className={styles.inspectionOverview} aria-labelledby="inspection-overview-title">
        <div className={styles.inspectionIntro}>
          <p className={styles.eyebrow}>Hồ sơ kiểm định</p>
          <h2 id="inspection-overview-title">
            Máy đã được kiểm tra kỹ thuật {String(unit.functionalChecks.length)} hạng mục
          </h2>
          <p>
            Kết quả bên dưới thuộc đúng máy có mã {unit.inventoryCode}, không phải thông tin chung
            của model.
          </p>
          <a href={`#${INSPECTION_SECTION_ID}`}>Xem toàn bộ kết quả kiểm tra</a>
        </div>
        <ul className={styles.inspectionPreview}>
          {unit.functionalChecks.slice(0, 5).map((check) => (
            <li data-tone={checkTone(check.status)} key={check.key}>
              <InspectionStatusIcon status={check.status} />
              <span>
                <strong>{check.label}</strong>
                <small>{catalogLabel(check.status)}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.unitRecord} aria-labelledby="unit-record-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Dữ kiện của đúng máy này</p>
            <h2 id="unit-record-title">Ngoại hình, sửa chữa và định danh đã che</h2>
          </div>
          <StatusChip
            label={`${String(acceptableChecks)}/${String(unit.functionalChecks.length)} hạng mục đạt hoặc không áp dụng`}
            tone={acceptableChecks === unit.functionalChecks.length ? 'success' : 'warning'}
          />
        </header>
        <div className={styles.recordGrid}>
          <Disclosure title="Ngoại hình và sửa chữa" open>
            <p>{unit.cosmeticNotes ?? 'Không có ghi chú ngoại hình công khai.'}</p>
            <dl className={styles.detailList}>
              <Fact label="Lịch sử sửa chữa" value={catalogLabel(unit.repairHistoryStatus)} />
              <Fact label="Tình trạng pin" value={catalogLabel(unit.batteryReplacementStatus)} />
              <Fact label="Ghi chú sửa chữa" value={unit.repairNotes} />
              <Fact
                label="Chu kỳ pin"
                value={
                  unit.batteryCycleCount === null || unit.batteryCycleCount === undefined
                    ? undefined
                    : String(unit.batteryCycleCount)
                }
              />
            </dl>
          </Disclosure>
          <Disclosure title="Định danh đã che">
            {unit.maskedIdentifiers.length === 0 ? (
              <p>Không có định danh công khai.</p>
            ) : (
              <dl className={styles.detailList}>
                {unit.maskedIdentifiers.map((identifier) => (
                  <Fact
                    key={identifier.type}
                    label={catalogLabel(identifier.type)}
                    value={identifier.maskedValue}
                  />
                ))}
              </dl>
            )}
            <p className={styles.disclosureNote}>
              Định danh đầy đủ không được hiển thị trên storefront.
            </p>
          </Disclosure>
        </div>
      </section>

      <section
        className={styles.inspectionSection}
        id={INSPECTION_SECTION_ID}
        aria-labelledby="inspection-title"
      >
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Kết quả đầy đủ</p>
            <h2 id="inspection-title">Từng hạng mục, không chỉ một nhãn tổng quát</h2>
          </div>
        </header>
        <ProductTrustCallout icon={<SealCheckIcon size={26} />}>
          {fulfillmentSummary(
            unit.fulfillmentAvailability.pickup,
            unit.fulfillmentAvailability.shipping,
          )}
          . Bảo hành {String(unit.warrantyDays)} ngày theo hồ sơ của máy đang bán.
        </ProductTrustCallout>
        <div className={styles.checkGroups}>
          {checkGroups.map((group, index) => (
            <details className={styles.checkGroup} key={group.label} open={index === 0}>
              <summary>
                <span>{group.label}</span>
                <span>{String(group.items.length)} mục</span>
              </summary>
              <ul>
                {group.items.map((check) => (
                  <li data-inspection-check key={check.key}>
                    <div>
                      <strong>{check.label}</strong>
                      {check.note === null || check.note === undefined ? null : <p>{check.note}</p>}
                    </div>
                    <StatusChip label={catalogLabel(check.status)} tone={checkTone(check.status)} />
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <RelatedUnitOffers offers={related} productName={product.name} productSlug={product.slug} />

      <MobilePurchaseBar
        inventoryCode={unit.inventoryCode}
        price={unit.price.salePrice}
        targetId={PURCHASE_ACTION_ID}
      />
    </div>
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

function Fact({ label, value }: { label: string; value?: string | null | undefined }) {
  if (value === null || value === undefined || value.length === 0) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Disclosure({
  children,
  open = false,
  title,
}: Readonly<{ children: ReactNode; open?: boolean; title: string }>) {
  return (
    <details className={styles.disclosure} open={open}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

function unitSpecItems(detail: UsedIphoneDetail, product: ProductDetail): ProductSpecItem[] {
  const { unit, variant } = detail;
  return [
    {
      icon: <CalendarBlankIcon size={24} />,
      label: 'Năm ra mắt',
      value: product.releaseYear,
    },
    { icon: <CpuIcon size={24} />, label: 'Chip', value: product.chipset },
    {
      icon: <DeviceMobileIcon size={24} />,
      label: 'Màn hình',
      value:
        product.screenSizeInches === null || product.screenSizeInches === undefined
          ? undefined
          : `${product.screenSizeInches} inch`,
    },
    {
      icon: <MemoryIcon size={24} />,
      label: 'RAM',
      value:
        product.ramGb === null || product.ramGb === undefined
          ? undefined
          : `${String(product.ramGb)} GB`,
    },
    {
      icon: <HardDriveIcon size={24} />,
      label: 'Dung lượng',
      value:
        variant.storageCapacityGb === null || variant.storageCapacityGb === undefined
          ? undefined
          : `${String(variant.storageCapacityGb)} GB`,
    },
    {
      detail:
        unit.batteryCycleCount === null || unit.batteryCycleCount === undefined
          ? undefined
          : `${String(unit.batteryCycleCount)} chu kỳ sạc`,
      icon: <BatteryMediumIcon size={24} />,
      label: 'Pin',
      value:
        unit.batteryHealthPercent === null || unit.batteryHealthPercent === undefined
          ? undefined
          : `${String(unit.batteryHealthPercent)}%`,
    },
    {
      icon: <SealCheckIcon size={24} />,
      label: 'Tình trạng',
      value: `Grade ${unit.conditionGrade}`,
    },
    { icon: <BarcodeIcon size={24} />, label: 'Mã model', value: unit.modelNumber },
    {
      icon: <SimCardIcon size={24} />,
      label: 'Cấu hình SIM',
      value: catalogLabel(unit.simConfiguration),
    },
    {
      icon: <GlobeHemisphereWestIcon size={24} />,
      label: 'Thị trường',
      value: unit.regionCode,
    },
    {
      icon: <LockOpenIcon size={24} />,
      label: 'Khóa mạng',
      value: catalogLabel(unit.simLockStatus),
    },
    {
      icon: <SimCardIcon size={24} />,
      label: 'Nhà mạng',
      value: unit.carrierName,
    },
    {
      icon: <WrenchIcon size={24} />,
      label: 'Sửa chữa',
      value: catalogLabel(unit.repairHistoryStatus),
    },
  ];
}

type FunctionalCheckStatus = UsedIphoneDetail['unit']['functionalChecks'][number]['status'];

function checkTone(status: FunctionalCheckStatus): 'danger' | 'neutral' | 'success' | 'warning' {
  if (status === 'PASS') return 'success';
  if (status === 'NOT_APPLICABLE') return 'neutral';
  if (status === 'FAIL') return 'danger';
  return 'warning';
}

function InspectionStatusIcon({ status }: { status: FunctionalCheckStatus }) {
  if (status === 'PASS') {
    return <CheckCircleIcon aria-hidden="true" size={20} weight="bold" />;
  }
  if (status === 'NOT_APPLICABLE') {
    return <MinusCircleIcon aria-hidden="true" size={20} weight="bold" />;
  }
  if (status === 'FAIL') {
    return <XCircleIcon aria-hidden="true" size={20} weight="bold" />;
  }
  return <WarningCircleIcon aria-hidden="true" size={20} weight="bold" />;
}
