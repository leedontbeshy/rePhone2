import { BuildingsIcon, StorefrontIcon, WarehouseIcon } from '@phosphor-icons/react/ssr';
import { StatusChip } from '@/components/ui';
import styles from './inventory-locations.module.css';

export interface InventoryLocationRecord {
  readonly code: string;
  readonly id: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly type: 'STORE' | 'WAREHOUSE';
}

export interface InventoryLocationsViewProps {
  readonly error?: string | null;
  readonly loading?: boolean;
  readonly locations: readonly InventoryLocationRecord[];
}

export function InventoryLocationsView({
  error = null,
  loading = false,
  locations,
}: InventoryLocationsViewProps) {
  const activeCount = locations.filter((location) => location.status === 'ACTIVE').length;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Kho hàng · Danh mục dùng chung</p>
        <h1>Địa điểm vận hành</h1>
        <p>Xem các cửa hàng và kho đang được dùng để nhận, giữ hoặc chuyển hàng.</p>
      </header>

      <section className={styles.summary} aria-label="Tổng quan địa điểm">
        <BuildingsIcon aria-hidden="true" size={28} weight="duotone" />
        <div>
          <strong>{String(activeCount)}</strong>
          <span>địa điểm đang hoạt động</span>
        </div>
        <p>Địa điểm được quản lý tập trung và không chỉnh sửa tại màn hình này.</p>
      </section>

      {error === null ? null : (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {loading ? <p className={styles.loading}>Đang tải danh sách địa điểm…</p> : null}
      {!loading && locations.length === 0 ? (
        <section className={styles.empty}>
          <h2>Chưa có địa điểm</h2>
          <p>Hãy kiểm tra lại dữ liệu cấu hình kho của hệ thống.</p>
        </section>
      ) : null}

      <section className={styles.grid} aria-label="Danh sách địa điểm">
        {locations.map((location) => (
          <article className={styles.card} key={location.id}>
            <div className={styles.icon}>
              {location.type === 'STORE' ? (
                <StorefrontIcon aria-hidden="true" size={26} />
              ) : (
                <WarehouseIcon aria-hidden="true" size={26} />
              )}
            </div>
            <div className={styles.copy}>
              <div className={styles.cardHeading}>
                <div>
                  <span>{locationTypeLabel(location.type)}</span>
                  <h2>{location.name}</h2>
                </div>
                <StatusChip
                  label={location.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                  tone={location.status === 'ACTIVE' ? 'success' : 'neutral'}
                />
              </div>
              <dl>
                <div>
                  <dt>Mã địa điểm</dt>
                  <dd>{location.code}</dd>
                </div>
                <div>
                  <dt>Vai trò</dt>
                  <dd>{locationPurpose(location.type)}</dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export function locationTypeLabel(type: InventoryLocationRecord['type']): string {
  return type === 'STORE' ? 'Cửa hàng' : 'Kho trung tâm';
}

function locationPurpose(type: InventoryLocationRecord['type']): string {
  return type === 'STORE'
    ? 'Giao nhận và phục vụ khách tại cửa hàng'
    : 'Lưu trữ và điều phối hàng hóa';
}
