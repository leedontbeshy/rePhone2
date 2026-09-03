import Link from 'next/link';
import {
  CollectionSurface,
  Pagination,
  ProductTextSummary,
  StatusPill,
} from '@/components/post-purchase';
import type { WarrantyListItem } from '@/lib/warranty-api';
import { presentWarranty, warrantyPageHref } from './warranty-presenters';
import styles from './warranties.module.css';

export function WarrantyList({
  busy = false,
  items,
  page,
  totalPages,
}: Readonly<{
  busy?: boolean | undefined;
  items: readonly WarrantyListItem[];
  page: number;
  totalPages: number;
}>) {
  return (
    <CollectionSurface
      ariaLabel="Danh sách bảo hành"
      busy={busy}
      footer={<Pagination buildHref={warrantyPageHref} page={page} totalPages={totalPages} />}
    >
      {items.map((item) => {
        const warranty = presentWarranty(item);
        return (
          <article className={styles.row} key={warranty.code}>
            <ProductTextSummary
              name={warranty.productName}
              secondary={`${warranty.variantName} · ${warranty.inventoryLabel}`}
            />
            <div className={styles.codeBlock}>
              <span>Mã bảo hành</span>
              <strong>{warranty.code}</strong>
              <small>Đơn {warranty.orderNumber}</small>
            </div>
            <dl className={styles.boundaries}>
              <div>
                <dt>Bắt đầu</dt>
                <dd>{warranty.startLabel}</dd>
              </div>
              <div>
                <dt>Kết thúc</dt>
                <dd>{warranty.endLabel}</dd>
              </div>
            </dl>
            <div className={styles.rowAction}>
              <StatusPill tone={warranty.tone}>{warranty.statusLabel}</StatusPill>
              <Link href={warranty.href}>Xem chi tiết</Link>
            </div>
          </article>
        );
      })}
    </CollectionSurface>
  );
}
