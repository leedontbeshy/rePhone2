'use client';

import { Suspense } from 'react';
import { RefundQueueView } from '@/components/backoffice/operations/refunds/refund-queue-view';

export default function BackofficeRefundsPage() {
  return (
    <Suspense fallback={null}>
      <RefundQueueView />
    </Suspense>
  );
}
