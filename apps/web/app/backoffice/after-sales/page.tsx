'use client';

import { Suspense } from 'react';
import { AfterSalesQueueView } from '@/components/backoffice/operations/after-sales/after-sales-queue-view';

export default function BackofficeAfterSalesPage() {
  return (
    <Suspense fallback={null}>
      <AfterSalesQueueView />
    </Suspense>
  );
}
