import Link from 'next/link';
import type { ReactNode } from 'react';
import type { UsedIphoneDetail } from '@/lib/catalog-api';
import {
  catalogLabel,
  countPassingChecks,
  fulfillmentSummary,
  groupFunctionalChecks,
} from '@/lib/catalog-presenters';
import { Badge, Price, StatusChip } from '@/components/ui';
import { CommerceActions } from '@/app/commerce-actions';
import { ActualUnitGallery } from './actual-unit-gallery';
import { MobilePurchaseBar } from './mobile-purchase-bar';
import styles from './dossier.module.css';

const PURCHASE_ACTION_ID = 'unit-purchase-actions';

export function UnitDossier({ detail }: Readonly<{ detail: UsedIphoneDetail }>) {
  const { product, unit, variant } = detail;
  const passingChecks = countPassingChecks(unit.functionalChecks);
  const checkGroups = groupFunctionalChecks(unit.functionalChecks);
  const canPurchase = unit.fulfillmentAvailability.pickup || unit.fulfillmentAvailability.shipping;

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumbs} aria-label="Đường dẫn">
        <Link href="/products">Sản phẩm</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/products/${product.slug}`}>{product.name}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{unit.inventoryCode}</span>
      </nav>

      <div className={styles.mobileContext}>
        <Badge>Grade {unit.conditionGrade}</Badge>
        <h1>{product.name}</h1>
        <p>{variant.displayName}</p>
      </div>

      <section className={styles.hero} aria-label="Thông tin máy đang bán">
        <ActualUnitGallery
          inventoryCode={unit.inventoryCode}
          media={unit.media}
          productName={product.name}
        />
        <aside className={styles.purchaseRail} aria-label="Tóm tắt mua hàng">
          <div className={styles.desktopContext}>
            <Badge>Grade {unit.conditionGrade}</Badge>
            <h1>{product.name}</h1>
            <p>{variant.displayName}</p>
          </div>
          <div className={styles.priceBlock}>
            <Price amount={unit.price.salePrice} />
            {unit.price.compareAtPrice === undefined ? null : (
              <s>{new Intl.NumberFormat('vi-VN').format(BigInt(unit.price.compareAtPrice))} ₫</s>
            )}
          </div>
          <dl className={styles.metricRail} aria-label="Chỉ số chính">
            <Metric
              label="Pin"
              value={
                unit.batteryHealthPercent === null || unit.batteryHealthPercent === undefined
                  ? 'Chưa có số liệu'
                  : `${String(unit.batteryHealthPercent)}%`
              }
            />
            <Metric
              label="Kiểm định"
              value={`${String(passingChecks)}/${String(unit.functionalChecks.length)} đạt`}
            />
            <Metric label="Bảo hành" value={`${String(unit.warrantyDays)} ngày`} />
          </dl>
          <div className={styles.purchaseFacts}>
            <Fact label="Khóa mạng" value={catalogLabel(unit.simLockStatus)} />
            <Fact label="Cấu hình SIM" value={catalogLabel(unit.simConfiguration)} />
            <Fact label="Pin" value={catalogLabel(unit.batteryReplacementStatus)} />
            <Fact label="Mã máy" value={unit.modelNumber} />
            <Fact label="Thị trường" value={unit.regionCode} />
          </div>
          <div className={styles.fulfillmentPanel}>
            <h2>Nhận hàng</h2>
            <p>
              {fulfillmentSummary(
                unit.fulfillmentAvailability.pickup,
                unit.fulfillmentAvailability.shipping,
              )}
            </p>
            <ul>
              <li>
                <StatusChip
                  label={
                    unit.fulfillmentAvailability.pickup
                      ? 'Có thể nhận tại cửa hàng'
                      : 'Chưa hỗ trợ nhận tại cửa hàng'
                  }
                  tone={unit.fulfillmentAvailability.pickup ? 'success' : 'neutral'}
                />
              </li>
              <li>
                <StatusChip
                  label={
                    unit.fulfillmentAvailability.shipping
                      ? 'Có thể giao hàng'
                      : 'Chưa hỗ trợ giao hàng'
                  }
                  tone={unit.fulfillmentAvailability.shipping ? 'success' : 'neutral'}
                />
              </li>
            </ul>
          </div>
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

      <section className={styles.trustStrip} aria-label="Dữ kiện về máy">
        <div>
          <strong>Ảnh của chính máy này</strong>
          <span>Mã máy {unit.inventoryCode}</span>
        </div>
        <div>
          <strong>{unit.functionalChecks.length} hạng mục công khai</strong>
          <span>Kết quả theo hồ sơ kiểm định hiện hành</span>
        </div>
        <div>
          <strong>Bảo hành {unit.warrantyDays} ngày</strong>
          <span>Thời hạn đã gắn với máy đang bán</span>
        </div>
      </section>

      <section className={styles.disclosureGrid} aria-label="Tình trạng máy">
        <Disclosure title="Ngoại hình và sửa chữa" open>
          <p>{unit.cosmeticNotes ?? 'Không có ghi chú ngoại hình công khai.'}</p>
          <dl className={styles.detailList}>
            <Fact label="Lịch sử sửa chữa" value={catalogLabel(unit.repairHistoryStatus)} />
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
      </section>

      <section className={styles.inspectionSection} aria-labelledby="inspection-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Hồ sơ kiểm định</p>
            <h2 id="inspection-title">Từng hạng mục, không chỉ một nhãn tổng quát</h2>
          </div>
          <StatusChip
            label={`${String(passingChecks)}/${String(unit.functionalChecks.length)} hạng mục đạt`}
            tone={passingChecks === unit.functionalChecks.length ? 'success' : 'warning'}
          />
        </header>
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
                    <StatusChip
                      label={catalogLabel(check.status)}
                      tone={
                        check.status === 'PASS'
                          ? 'success'
                          : check.status === 'FAIL'
                            ? 'danger'
                            : 'warning'
                      }
                    />
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <MobilePurchaseBar
        inventoryCode={unit.inventoryCode}
        price={unit.price.salePrice}
        targetId={PURCHASE_ACTION_ID}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
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
