'use client';

import { Suspense } from 'react';
import { PaymentQueueView } from '@/components/backoffice/operations/payments/payment-queue-view';

export default function BackofficePaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentQueueView />
    </Suspense>
  );
}
