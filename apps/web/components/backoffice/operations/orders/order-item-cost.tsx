import Link from 'next/link';
import { formatVnd } from '@/components/ui';
import type { BackofficeOrderItem } from '@/lib/fulfillment-api';
import styles from './orders.module.css';

export function OrderItemCost({ item }: Readonly<{ item: BackofficeOrderItem }>) {
  const cost = item.currentCost;
  if (cost === undefined) return null;
  const money = (value: string | null) => (value === null ? 'Chưa ghi nhận' : formatVnd(value));
  return (
    <div className={styles.itemCost}>
      <div className={styles.itemCostHeading}>
        <strong>Giá vốn đang lưu</strong>
        {cost.inventoryUnitId !== null && (
          <Link href={`/backoffice/inventory/units/${encodeURIComponent(cost.inventoryUnitId)}`}>
            Xem hồ sơ máy
          </Link>
        )}
      </div>
      {cost.inventoryUnitId === null ? (
        <p className={styles.muted}>Sản phẩm này chưa có dữ liệu giá vốn.</p>
      ) : (
        <dl>
          <div>
            <dt>Giá nhập / máy</dt>
            <dd>{money(cost.acquisitionCost)}</dd>
          </div>
          <div>
            <dt>Chi phí bổ sung / máy</dt>
            <dd>{money(cost.additionalCost)}</dd>
          </div>
          <div>
            <dt>Giá vốn {item.quantity > 1 ? `${String(item.quantity)} máy` : 'máy'}</dt>
            <dd>{money(cost.lineCost)}</dd>
          </div>
        </dl>
      )}
      <p className={styles.muted}>Theo hồ sơ máy hiện tại; có thể khác thời điểm bán.</p>
    </div>
  );
}
