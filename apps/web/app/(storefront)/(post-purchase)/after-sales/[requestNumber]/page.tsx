import { Suspense } from 'react';
import { AfterSalesDetail } from '@/components/post-purchase/after-sales/after-sales-detail';
import { CollectionLoading } from '@/components/post-purchase';

export default function AfterSalesDetailPage() {
  return (
    <Suspense fallback={<CollectionLoading label="Đang tải yêu cầu hỗ trợ…" />}>
      <AfterSalesDetail />
    </Suspense>
  );
}
