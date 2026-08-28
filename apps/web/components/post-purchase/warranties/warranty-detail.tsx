import Link from 'next/link';
import {
  DetailGrid,
  DetailPanel,
  LifecycleJourney,
  PostPurchasePageHeader,
  ProductTextSummary,
  StatusPill,
} from '@/components/post-purchase';
import type { WarrantyDetail as WarrantyDetailDto } from '@/lib/warranty-api';
import {
  formatWarrantyDate,
  maskedWarrantyIdentifier,
  presentWarranty,
  warrantyJourney,
} from './warranty-presenters';
import styles from './warranties.module.css';

export function WarrantyDetail({ detail }: Readonly<{ detail: WarrantyDetailDto }>) {
  const warranty = presentWarranty(detail);
  const supportHref = `/after-sales/new?orderNumber=${encodeURIComponent(detail.orderNumber)}&orderItemId=${encodeURIComponent(detail.orderItemId)}`;
  return (
    <>
      <PostPurchasePageHeader
        title={detail.productName}
        description={`${detail.variantName} · Đơn ${detail.orderNumber}`}
        status={<StatusPill tone={warranty.tone}>{warranty.statusLabel}</StatusPill>}
        action={
          <Link className={styles.primaryAction} href={supportHref}>
            Yêu cầu hỗ trợ
          </Link>
        }
      />
      <LifecycleJourney
        ariaLabel="Thời hạn bảo hành"
        currentSummary={warranty.statusLabel}
        stages={warrantyJourney(detail)}
        title="Thời hạn bảo hành"
      />
      <DetailGrid>
        <DetailPanel title="Sản phẩm được bảo hành">
          <ProductTextSummary name={detail.productName} secondary={detail.variantName} />
          <dl className={styles.specifications}>
            <Spec label="Mã bảo hành" value={detail.warrantyCode} />
            <Spec label="Mã sản phẩm" value={detail.sku} />
            <Spec label="Mã máy" value={detail.inventoryCode ?? 'Theo đơn hàng'} />
            <Spec
              label="Mã nhận diện"
              value={maskedWarrantyIdentifier(detail.maskedIdentifierSuffix)}
            />
          </dl>
        </DetailPanel>
        <DetailPanel title="Thông tin hiệu lực">
          <dl className={styles.specifications}>
            <Spec label="Thời hạn ghi nhận" value={`${String(detail.daysSnapshot)} ngày`} />
            <Spec label="Bắt đầu" value={formatWarrantyDate(detail.startAt)} />
            <Spec label="Kết thúc" value={formatWarrantyDate(detail.endAt)} />
          </dl>
        </DetailPanel>
      </DetailGrid>
      <DetailPanel title="Điều khoản đã ghi nhận">
        <p className={styles.terms}>{detail.termsSnapshot}</p>
      </DetailPanel>
      <p className={styles.supportNote}>
        Việc gửi yêu cầu không đồng nghĩa yêu cầu chắc chắn được chấp nhận. rePhone sẽ kiểm tra
        thông tin đơn hàng và tình trạng sản phẩm trước khi phản hồi.
      </p>
    </>
  );
}

function Spec({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
