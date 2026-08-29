'use client';

import { Suspense } from 'react';
import { CatalogVoucherShell } from '@/components/backoffice';
import { VoucherListView } from '@/components/backoffice/vouchers/voucher-list-view';
import { Skeleton } from '@/components/ui';

export default function BackofficeVouchersPage() {
  return (
    <Suspense fallback={<VoucherListFallback />}>
      <VoucherListView />
    </Suspense>
  );
}

function VoucherListFallback() {
  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Mã ưu đãi' }]}>
      <section aria-label="Đang tải mã ưu đãi" role="status">
        <Skeleton height="2rem" width="16rem" />
        <Skeleton height="8rem" width="100%" />
        <span className="rp-visually-hidden">Đang tải mã ưu đãi…</span>
      </section>
    </CatalogVoucherShell>
  );
}
