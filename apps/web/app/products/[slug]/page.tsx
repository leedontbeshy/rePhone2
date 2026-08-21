import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CatalogHeader, Availability, MediaImage, Money } from '../../catalog-ui';
import { CatalogApiError, getPublicProduct, isIphoneVariant } from '../../../lib/catalog-api';
import { CommerceActions } from '../../commerce-actions';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  try {
    const product = await getPublicProduct(slug);
    return (
      <>
        <CatalogHeader />
        <main className="catalog-shell detail-shell">
          <nav className="breadcrumbs" aria-label="Đường dẫn">
            <Link href="/products">Sản phẩm</Link>
            <span>/</span>
            <span aria-current="page">{product.name}</span>
          </nav>
          <section className="product-detail-hero">
            <div className="detail-media">
              <MediaImage media={product.media[0]} className="detail-main-image" />
            </div>
            <div>
              <p className="eyebrow">
                {product.productType === 'IPHONE' ? 'iPhone cũ' : 'Phụ kiện'}
              </p>
              <h1>{product.name}</h1>
              {product.description === null || product.description === undefined ? null : (
                <p>{product.description}</p>
              )}
              {product.productType === 'IPHONE' ? (
                <dl className="spec-grid">
                  <Spec label="Năm ra mắt" value={product.releaseYear} />
                  <Spec label="Chip" value={product.chipset} />
                  <Spec
                    label="RAM"
                    value={
                      product.ramGb === null || product.ramGb === undefined
                        ? null
                        : `${String(product.ramGb)} GB`
                    }
                  />
                  <Spec
                    label="Màn hình"
                    value={
                      product.screenSizeInches === null || product.screenSizeInches === undefined
                        ? null
                        : `${product.screenSizeInches} inch`
                    }
                  />
                </dl>
              ) : null}
            </div>
          </section>

          <section className="variant-section">
            <div className="section-heading">
              <p className="eyebrow">Lựa chọn hiện có</p>
              <h2>
                {product.productType === 'IPHONE' ? 'Từng máy đang bán' : 'Biến thể phụ kiện'}
              </h2>
            </div>
            {product.variants.length === 0 ? (
              <div className="empty-state">
                <p>Sản phẩm hiện chưa có lựa chọn công khai.</p>
              </div>
            ) : (
              <div className="variant-list">
                {product.variants.map((variant) =>
                  isIphoneVariant(variant) ? (
                    <article className="variant-card" key={variant.id}>
                      <div className="variant-heading">
                        <div>
                          <h3>{variant.displayName}</h3>
                          <p>{variant.sku}</p>
                        </div>
                        <span>{variant.warrantySummary.days} ngày bảo hành</span>
                      </div>
                      {variant.availableUnits.length === 0 ? (
                        <p className="muted">Cấu hình này đang tạm hết máy.</p>
                      ) : (
                        <div className="unit-grid">
                          {variant.availableUnits.map((unit) => (
                            <Link
                              className="unit-card"
                              key={unit.inventoryCode}
                              href={`/products/${product.slug}/units/${unit.inventoryCode}`}
                            >
                              <MediaImage media={unit.thumbnail} className="unit-thumbnail" />
                              <div>
                                <span className="unit-code">{unit.inventoryCode}</span>
                                <strong>
                                  <Money value={unit.price.salePrice} />
                                </strong>
                                <span>
                                  Grade {unit.conditionGrade} · Pin{' '}
                                  {unit.batteryHealthPercent ?? '—'}%
                                </span>
                                <span>
                                  {unit.fulfillmentAvailability.pickup
                                    ? 'Có nhận tại cửa hàng'
                                    : 'Chỉ giao hàng'}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </article>
                  ) : (
                    <article className="variant-card accessory-card" key={variant.id}>
                      <MediaImage media={variant.media[0]} className="accessory-image" />
                      <div>
                        <div className="variant-heading">
                          <div>
                            <h3>{variant.displayName}</h3>
                            <p>{variant.sku}</p>
                          </div>
                          <Availability available={variant.fulfillmentAvailability.inStock} />
                        </div>
                        <p className="product-price">
                          <Money value={variant.price.salePrice} />
                        </p>
                        <p className="muted">Bảo hành {variant.warrantySummary.days} ngày</p>
                        <p className="muted">
                          {variant.fulfillmentAvailability.pickup
                            ? 'Nhận tại cửa hàng'
                            : 'Không có pickup'}{' '}
                          ·{' '}
                          {variant.fulfillmentAvailability.shipping
                            ? 'Có giao hàng'
                            : 'Tạm hết hàng giao'}
                        </p>
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
        </main>
      </>
    );
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

function Spec({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined) {
    return null;
  }
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
