import { Suspense } from 'react';
import { AfterSalesList } from '@/components/post-purchase/after-sales/after-sales-list';
import { CollectionLoading } from '@/components/post-purchase';

export default function AfterSalesPage() {
  return (
    <Suspense fallback={<CollectionLoading label="Đang tải yêu cầu hỗ trợ…" />}>
      <AfterSalesList />
    </Suspense>
  );
}
