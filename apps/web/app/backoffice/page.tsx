'use client';

import { CatalogVoucherShell } from '@/components/backoffice';
import { FinancialOverview } from '@/components/backoffice/overview/financial-overview';

export default function BackofficeOverviewPage() {
  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Kinh doanh' }, { label: 'Báo cáo tài chính' }]}>
      <FinancialOverview />
    </CatalogVoucherShell>
  );
}
