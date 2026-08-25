import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CommerceActions } from '@/app/commerce-actions';
import { ExactUnitCard } from '@/components/catalog/exact-unit-card';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { Price, StatusChip } from '@/components/ui';
import { CatalogApiError, getPublicProduct, isIphoneVariant } from '@/lib/catalog-api';
import { fulfillmentSummary } from '@/lib/catalog-presenters';
import styles from './model.module.css';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  try {
    const product = await getPublicProduct(slug);
    return (
      <div className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Đường dẫn">
          <Link href="/products">Sản phẩm</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <section className={styles.hero}>
          <div className={styles.modelMedia}>
            <span>Ảnh minh họa model</span>
            <PublicMediaImage
              className={styles.heroImage}
              fallbackLabel={`Chưa có ảnh minh họa ${product.name}`}
              media={product.media[0]}
              priority
            />
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              {product.productType === 'IPHONE' ? 'Khám phá model iPhone' : 'Phụ kiện'}
            </p>
            <h1>{product.name}</h1>
            {product.description === null || product.description === undefined ? null : (
              <p className={styles.description}>{product.description}</p>
            )}
            {product.productType === 'IPHONE' ? (
              <dl className={styles.modelFacts}>
                <Fact label="Năm ra mắt" value={product.releaseYear} />
                <Fact label="Chip" value={product.chipset} />
                <Fact
                  label="RAM"
                  value={
                    product.ramGb === null || product.ramGb === undefined
                      ? undefined
                      : `${String(product.ramGb)} GB`
                  }
                />
                <Fact
                  label="Màn hình"
                  value={
                    product.screenSizeInches === null || product.screenSizeInches === undefined
                      ? undefined
                      : `${product.screenSizeInches} inch`
                  }
                />
              </dl>
            ) : null}
          </div>
        </section>

        <section className={styles.variants} aria-labelledby="available-options-title">
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Lựa chọn hiện có</p>
              <h2 id="available-options-title">
                {product.productType === 'IPHONE'
                  ? 'Chọn đúng chiếc máy đang bán'
                  : 'Chọn biến thể phụ kiện'}
              </h2>
            </div>
            {product.productType === 'IPHONE' ? (
              <p>Giá, pin và tình trạng thuộc riêng từng mã máy.</p>
            ) : null}
          </header>

          {product.variants.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>Chưa có lựa chọn công khai</h3>
              <p>Hãy quay lại catalog để xem các sản phẩm khác đang khả dụng.</p>
              <Link href="/products">Trở lại catalog</Link>
            </div>
          ) : (
            <div className={styles.variantList}>
              {product.variants.map((variant) =>
                isIphoneVariant(variant) ? (
                  <article className={styles.iphoneVariant} key={variant.id}>
                    <header className={styles.variantHeader}>
                      <div>
                        <h3>{variant.displayName}</h3>
                        <p>{variant.sku}</p>
                      </div>
                      <StatusChip
                        label={`${String(variant.warrantySummary.days)} ngày bảo hành`}
                        tone="neutral"
                      />
                    </header>
                    {variant.availableUnits.length === 0 ? (
                      <p className={styles.unavailable}>Cấu hình này đang tạm hết máy.</p>
                    ) : (
                      <div className={styles.unitGrid}>
                        {variant.availableUnits.map((unit) => (
                          <ExactUnitCard
                            key={unit.inventoryCode}
                            productSlug={product.slug}
                            unit={unit}
                          />
                        ))}
                      </div>
                    )}
                  </article>
                ) : (
                  <article className={styles.accessoryVariant} key={variant.id}>
                    <PublicMediaImage
                      className={styles.accessoryImage}
                      fallbackLabel={`Chưa có ảnh ${variant.displayName}`}
                      media={variant.media[0]}
                    />
                    <div className={styles.accessoryBody}>
                      <div className={styles.variantHeader}>
                        <div>
                          <h3>{variant.displayName}</h3>
                          <p>{variant.sku}</p>
                        </div>
                        <StatusChip
                          label={
                            variant.fulfillmentAvailability.inStock ? 'Còn hàng' : 'Tạm hết hàng'
                          }
                          tone={variant.fulfillmentAvailability.inStock ? 'success' : 'neutral'}
                        />
                      </div>
                      <Price amount={variant.price.salePrice} />
                      <dl className={styles.accessoryFacts}>
                        <Fact
                          label="Bảo hành"
                          value={`${String(variant.warrantySummary.days)} ngày`}
                        />
                        <Fact
                          label="Nhận hàng"
                          value={fulfillmentSummary(
                            variant.fulfillmentAvailability.pickup,
                            variant.fulfillmentAvailability.shipping,
                          )}
                        />
                      </dl>
                      <CommerceActions
                        itemType="ACCESSORY"
                        variantId={variant.id}
                        available={variant.fulfillmentAvailability.inStock}
                      />
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </section>
      </div>
    );
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound();
    throw error;
  }
}

function Fact({ label, value }: { label: string; value?: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
