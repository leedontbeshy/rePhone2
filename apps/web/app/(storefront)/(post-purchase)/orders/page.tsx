import { Suspense } from 'react';
import { CollectionLoading } from '@/components/post-purchase';
import { CustomerOrdersView } from '@/components/post-purchase/orders/customer-orders-view';

export default function OrdersPage() {
  return (
    <Suspense fallback={<CollectionLoading label="Đang tải đơn hàng…" />}>
      <CustomerOrdersView />
    </Suspense>
  );
}
