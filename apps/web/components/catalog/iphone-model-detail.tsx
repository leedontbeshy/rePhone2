import {
  ArrowRightIcon,
  CalendarBlankIcon,
  CpuIcon,
  DeviceMobileIcon,
  MemoryIcon,
  PaletteIcon,
  BatteryHighIcon,
  LightningIcon,
  CameraIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { CatalogTrustStrip } from '@/components/storefront/catalog-trust-strip';
import { Price } from '@/components/ui';
import type { ProductDetail, ProductListItem } from '@/lib/catalog-api';
import {
  sortModelUnitOffers,
  toModelUnitOffers,
  type ModelUnitOfferSort,
} from '@/lib/model-unit-offers';
import { resolveIphoneModelFacts } from '@/lib/iphone-model-facts';
import { getIphoneTechnicalSpecs } from '@/lib/iphone-technical-specs';
import { modelBannerArt, modelStudioArt } from '@/lib/model-studio-art';
import { ExactUnitCard } from './exact-unit-card';
import { ProductBreadcrumbs, type ProductSpecItem } from './product-detail-components';
import { ProductMediaGallery } from './product-media-gallery';
import { ModelUnitSortControl } from './model-unit-sort-control';
import styles from './iphone-model-detail.module.css';

interface IphoneModelDetailProps {
  readonly product: ProductDetail;
  readonly sort: ModelUnitOfferSort;
  readonly summary?: ProductListItem | undefined;
}

export function IphoneModelDetail({ product, sort, summary }: IphoneModelDetailProps) {
  const offers = sortModelUnitOffers(toModelUnitOffers(product), sort);
  const facts = resolveIphoneModelFacts(product);
  const technical = getIphoneTechnicalSpecs(product.slug);
  const banner = modelBannerArt(product.slug);
  const art = banner ?? modelStudioArt(product.slug);
  const matchingSummary = summary?.id === product.id && summary.slug === product.slug;
  const fromPrice = matchingSummary && summary.inStock ? summary.price.fromPrice : undefined;
  const factItems: readonly ProductSpecItem[] = [
    { icon: <CalendarBlankIcon size={24} />, label: 'Năm ra mắt', value: facts.releaseYear },
    { icon: <CpuIcon size={24} />, label: 'Chip', value: facts.chipset },
    {
      icon: <MemoryIcon size={24} />,
      label: 'RAM',
      value: facts.ramGb == null ? undefined : `${String(facts.ramGb)} GB`,
    },
    {
      icon: <DeviceMobileIcon size={24} />,
      label: 'Màn hình',
      value: facts.screenSizeInches == null ? undefined : `${facts.screenSizeInches} inch`,
    },
    {
      icon: <PaletteIcon size={24} />,
      label: 'Màu sắc',
      value: facts.colors.length === 0 ? undefined : facts.colors.join(' · '),
    },
    {
      icon: <BatteryHighIcon size={24} />,
      label: 'Pin · xem video',
      value: technical?.videoHours == null ? undefined : `Lên đến ${technical.videoHours} giờ`,
    },
    {
      icon: <LightningIcon size={24} />,
      label: 'Sạc nhanh',
      value:
        technical?.chargeMinutes == null
          ? undefined
          : `Đến 50% trong khoảng ${technical.chargeMinutes} phút`,
    },
    {
      icon: <ArrowsClockwiseIcon size={24} />,
      label: 'Tần số quét',
      value:
        technical === undefined
          ? undefined
          : technical.refreshHz === 120
            ? 'ProMotion đến 120 Hz'
            : '60 Hz',
    },
    { icon: <DeviceMobileIcon size={24} />, label: 'Độ phân giải', value: technical?.resolution },
    {
      icon: <CameraIcon size={24} />,
      label: 'Camera chính',
      value: technical?.rearCamera == null ? undefined : `${technical.rearCamera} MP`,
    },
    {
      icon: <CameraIcon size={24} />,
      label: 'Camera trước',
      value: technical?.frontCamera == null ? undefined : `${technical.frontCamera} MP`,
    },
  ];
  const visibleFacts = factItems.filter(({ value }) => value != null && value !== '');

  return (
    <div className={styles.page}>
      <ProductBreadcrumbs productName={product.name} />

      <section className={styles.hero} aria-labelledby="model-title">
        <div className={styles.heroCopy}>
          <h1 id="model-title">{product.name}</h1>
          <p className={styles.description}>Xem từng máy. Chọn đúng chiếc bạn cần.</p>
          {fromPrice === undefined ? (
            <p className={styles.availability}>
              {offers.length === 0 ? 'Dòng máy đang tạm hết máy' : 'Xem giá của từng máy bên dưới'}
            </p>
          ) : (
            <p className={styles.startingPrice}>
              <span>Giá từ</span>
              <Price amount={fromPrice} />
            </p>
          )}
          <a className={styles.heroAction} href="#available-options-title">
            {offers.length === 0 ? 'Xem tình trạng dòng máy' : 'Xem máy đang có sẵn'}
            <ArrowRightIcon aria-hidden="true" size={20} weight="bold" />
          </a>
        </div>
        <ProductMediaGallery
          fallbackLabel={`Chưa có ảnh minh họa ${product.name}`}
          label="Ảnh minh họa dòng máy"
          media={art === undefined ? product.media : [art]}
          priority
          variant="model"
          fit={banner === undefined ? 'contain' : 'cover'}
        />
      </section>

      {visibleFacts.length === 0 ? null : (
        <dl className={styles.factRail} aria-label={`Thông số dòng ${product.name}`}>
          {visibleFacts.map((fact) => (
            <div key={fact.label}>
              <dt>
                <span aria-hidden="true">{fact.icon}</span>
                <span>{fact.label}</span>
              </dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {technical === undefined ? null : (
        <p className={styles.specNote}>
          Pin và tốc độ sạc theo điều kiện thử nghiệm của Apple, có thể khác tùy phiên bản và cách
          sử dụng.{' '}
          <a href={technical.source} target="_blank" rel="noreferrer">
            Thông số từ Apple
          </a>
        </p>
      )}

      <section className={styles.offers} aria-labelledby="available-options-title">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="available-options-title">Chọn chiếc {product.name} của bạn</h2>
          </div>
          {offers.length > 1 ? <ModelUnitSortControl value={sort} /> : null}
        </header>

        {offers.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>Dòng máy này đang tạm hết máy</h3>
            <p>
              Thông tin dòng máy vẫn được giữ lại để bạn tham khảo. Bạn có thể xem các dòng máy khác
              đang bán tại rePhone.
            </p>
            <Link href="/products?productType=IPHONE&inStock=true">Xem máy đang bán</Link>
          </div>
        ) : (
          <div className={styles.unitGrid}>
            {offers.map((offer) => (
              <ExactUnitCard
                colorHex={offer.colorHex}
                colorName={offer.colorName}
                key={offer.unit.inventoryCode}
                productName={product.name}
                productRamGb={offer.productRamGb}
                productSlug={product.slug}
                storageCapacityGb={offer.storageCapacityGb}
                unit={offer.unit}
                variantDisplayName={offer.variantDisplayName}
              />
            ))}
          </div>
        )}
      </section>
      <CatalogTrustStrip />
    </div>
  );
}
