import {
  CalendarBlankIcon,
  CpuIcon,
  DeviceMobileIcon,
  MemoryIcon,
  PaletteIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import type { ProductDetail } from '@/lib/catalog-api';
import {
  sortModelUnitOffers,
  toModelUnitOffers,
  type ModelUnitOfferSort,
} from '@/lib/model-unit-offers';
import { resolveIphoneModelFacts } from '@/lib/iphone-model-facts';
import { ExactUnitCard } from './exact-unit-card';
import {
  ProductBreadcrumbs,
  ProductSpecGrid,
  ProductTrustCallout,
} from './product-detail-components';
import { ProductMediaGallery } from './product-media-gallery';
import { ModelUnitSortControl } from './model-unit-sort-control';
import styles from './iphone-model-detail.module.css';

interface IphoneModelDetailProps {
  readonly product: ProductDetail;
  readonly sort: ModelUnitOfferSort;
}

export function IphoneModelDetail({ product, sort }: IphoneModelDetailProps) {
  const offers = sortModelUnitOffers(toModelUnitOffers(product), sort);
  const facts = resolveIphoneModelFacts(product);

  return (
    <div className={styles.page}>
      <ProductBreadcrumbs productName={product.name} />

      <section className={styles.hero} aria-labelledby="model-title">
        <ProductMediaGallery
          fallbackLabel={`Chưa có ảnh minh họa ${product.name}`}
          label="Ảnh minh họa model"
          media={product.media}
          priority
        />

        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Khám phá model iPhone</p>
          <h1 id="model-title">{product.name}</h1>
          <p className={styles.description}>
            Khám phá {product.name} cũ tại rePhone; giá và tình trạng được ghi rõ cho từng máy đang
            có sẵn.
          </p>

          <ProductSpecGrid
            className={styles.modelFacts ?? ''}
            items={[
              {
                icon: <CalendarBlankIcon size={25} weight="regular" />,
                label: 'Năm ra mắt',
                value: facts.releaseYear,
              },
              {
                icon: <CpuIcon size={25} weight="regular" />,
                label: 'Chip',
                value: facts.chipset,
              },
              {
                icon: <MemoryIcon size={25} weight="regular" />,
                label: 'RAM',
                value:
                  facts.ramGb === null || facts.ramGb === undefined
                    ? undefined
                    : `${String(facts.ramGb)} GB`,
              },
              {
                icon: <DeviceMobileIcon size={25} weight="regular" />,
                label: 'Màn hình',
                value:
                  facts.screenSizeInches === null || facts.screenSizeInches === undefined
                    ? undefined
                    : `${facts.screenSizeInches} inch`,
              },
            ]}
          />

          {facts.colors.length === 0 ? null : (
            <dl className={styles.colorPanel}>
              <div>
                <dt>
                  <PaletteIcon aria-hidden="true" size={25} weight="regular" />
                  Màu sắc
                </dt>
                <dd>{facts.colors.join(' · ')}</dd>
              </div>
            </dl>
          )}

          <ProductTrustCallout icon={<ShieldCheckIcon size={27} weight="regular" />}>
            Các máy đang hiển thị đã được kỹ thuật viên kiểm tra kỹ lưỡng trước khi đưa lên bán.
          </ProductTrustCallout>
        </div>
      </section>

      <section className={styles.offers} aria-labelledby="available-options-title">
        <header className={styles.sectionHeader}>
          <h2 id="available-options-title">Các máy đang có sẵn</h2>
          <div className={styles.sectionTools}>
            <p>Giá, pin và tình trạng thuộc riêng từng mã máy.</p>
            {offers.length > 1 ? <ModelUnitSortControl value={sort} /> : null}
          </div>
        </header>

        {offers.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>Model này đang tạm hết máy</h3>
            <p>
              Thông tin model vẫn được giữ lại để bạn tham khảo. Bạn có thể xem các model khác đang
              bán tại rePhone.
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
    </div>
  );
}
