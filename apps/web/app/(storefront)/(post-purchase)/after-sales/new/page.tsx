import { Suspense } from 'react';
import { AfterSalesCreate } from '@/components/post-purchase/after-sales/after-sales-create';
import { CollectionLoading } from '@/components/post-purchase';

export default function CreateAfterSalesPage() {
  return (
    <Suspense fallback={<CollectionLoading label="Đang kiểm tra sản phẩm…" />}>
      <AfterSalesCreate />
    </Suspense>
  );
}
