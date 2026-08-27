import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CommerceActions } from '@/app/commerce-actions';
import { IphoneModelDetail } from '@/components/catalog/iphone-model-detail';
import { ProductBreadcrumbs } from '@/components/catalog/product-detail-components';
import { PublicMediaImage } from '@/components/catalog/public-media';
import { Price, StatusChip } from '@/components/ui';
import { CatalogApiError, getPublicProduct, isIphoneVariant } from '@/lib/catalog-api';
import { fulfillmentSummary } from '@/lib/catalog-presenters';
import { toModelUnitOfferSort } from '@/lib/model-unit-offers';
import styles from './model.module.css';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  try {
    const product = await getPublicProduct(slug);
    if (product.productType === 'IPHONE') {
      const query = await searchParams;
      return <IphoneModelDetail product={product} sort={toModelUnitOfferSort(query['unitSort'])} />;
    }

    return (
      <div className={styles.page}>
        <ProductBreadcrumbs productName={product.name} />

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
            <p className={styles.eyebrow}>Phụ kiện</p>
            <h1>{product.name}</h1>
            {product.description === null || product.description === undefined ? null : (
              <p className={styles.description}>{product.description}</p>
            )}
          </div>
        </section>

        <section className={styles.variants} aria-labelledby="available-options-title">
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Lựa chọn hiện có</p>
              <h2 id="available-options-title">Chọn biến thể phụ kiện</h2>
            </div>
          </header>

          {product.variants.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>Chưa có lựa chọn công khai</h3>
              <p>Hãy quay lại catalog để xem các sản phẩm khác đang khả dụng.</p>
              <Link href="/products">Trở lại catalog</Link>
            </div>
          ) : (
            <div className={styles.variantList}>
              {product.variants.map((variant) => {
                if (isIphoneVariant(variant)) return null;
                return (
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
                );
              })}
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
