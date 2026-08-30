'use client';

import { Suspense } from 'react';
import { OrderListView } from '@/components/backoffice/operations/orders';

export default function BackofficeOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrderListView />
    </Suspense>
  );
}
