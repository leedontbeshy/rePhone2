import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CatalogHeader, MediaImage, Money } from '../../../../catalog-ui';
import { CatalogApiError, getPublicUsedIphone } from '../../../../../lib/catalog-api';

interface UsedIphonePageProps {
  params: Promise<{ slug: string; inventoryCode: string }>;
}

export default async function UsedIphonePage({ params }: UsedIphonePageProps) {
  const { slug, inventoryCode } = await params;
  try {
    const detail = await getPublicUsedIphone(slug, inventoryCode);
    const { product, variant, unit } = detail;
    return (
      <>
        <CatalogHeader />
        <main className="catalog-shell detail-shell">
          <nav className="breadcrumbs" aria-label="Đường dẫn">
            <Link href="/products">Sản phẩm</Link>
            <span>/</span>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
            <span>/</span>
            <span aria-current="page">{unit.inventoryCode}</span>
          </nav>

          <section className="unit-detail-hero">
            <div className="detail-media">
              <MediaImage media={unit.media[0]} className="detail-main-image" />
              {unit.media.length > 1 ? (
                <div className="media-strip">
                  {unit.media.slice(1).map((media) => (
                    <MediaImage key={media.url} media={media} className="media-thumb" />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="unit-summary">
              <p className="eyebrow">Máy thật · {unit.inventoryCode}</p>
              <h1>{product.name}</h1>
              <p className="detail-subtitle">{variant.displayName}</p>
              <p className="detail-price">
                <Money value={unit.price.salePrice} />
              </p>
              <dl className="spec-grid">
                <Spec label="Ngoại hình" value={`Grade ${unit.conditionGrade}`} />
                <Spec
                  label="Pin"
                  value={
                    unit.batteryHealthPercent === null || unit.batteryHealthPercent === undefined
                      ? null
                      : `${String(unit.batteryHealthPercent)}%`
                  }
                />
                <Spec label="Chu kỳ pin" value={unit.batteryCycleCount} />
                <Spec label="Tình trạng pin" value={labelEnum(unit.batteryReplacementStatus)} />
                <Spec label="Khóa mạng" value={labelEnum(unit.simLockStatus)} />
                <Spec label="Cấu hình SIM" value={labelEnum(unit.simConfiguration)} />
                <Spec label="Mã máy" value={unit.modelNumber} />
                <Spec label="Thị trường" value={unit.regionCode} />
                <Spec label="Bảo hành" value={`${String(unit.warrantyDays)} ngày`} />
              </dl>
              <div className="fulfillment-box">
                <strong>Khả năng nhận hàng</strong>
                <span>
                  {unit.fulfillmentAvailability.pickup ? '✓ Nhận tại cửa hàng' : '– Không pickup'}
                </span>
                <span>
                  {unit.fulfillmentAvailability.shipping
                    ? '✓ Có thể giao hàng'
                    : '– Không giao hàng'}
                </span>
              </div>
            </div>
          </section>

          <section className="detail-panels">
            <article className="detail-panel">
              <h2>Tình trạng và sửa chữa</h2>
              <p>{unit.cosmeticNotes ?? 'Không có ghi chú ngoại hình.'}</p>
              <dl className="stacked-specs">
                <Spec label="Lịch sử sửa chữa" value={labelEnum(unit.repairHistoryStatus)} />
                <Spec label="Ghi chú sửa chữa" value={unit.repairNotes} />
              </dl>
            </article>
            <article className="detail-panel">
              <h2>Định danh đã ẩn</h2>
              {unit.maskedIdentifiers.length === 0 ? (
                <p>Không có định danh công khai.</p>
              ) : (
                <ul className="identifier-list">
                  {unit.maskedIdentifiers.map((identifier) => (
                    <li key={identifier.type}>
                      <span>{identifier.type.replace('_', ' ')}</span>
                      <strong>{identifier.maskedValue}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="checklist-section">
            <div className="section-heading">
              <p className="eyebrow">Checklist kiểm định</p>
              <h2>18 hạng mục chức năng</h2>
            </div>
            <div className="check-grid">
              {unit.functionalChecks.map((check) => (
                <article className="check-card" key={check.key}>
                  <span className={check.status === 'PASS' ? 'check-pass' : 'check-other'}>
                    {labelEnum(check.status)}
                  </span>
                  <h3>{check.label}</h3>
                  {check.note === null || check.note === undefined ? null : <p>{check.note}</p>}
                </article>
              ))}
            </div>
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

function labelEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
