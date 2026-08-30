'use client';

import { Suspense } from 'react';
import { WarrantyQueueView } from '@/components/backoffice/operations/warranties/warranty-queue-view';

export default function BackofficeWarrantiesPage() {
  return (
    <Suspense fallback={null}>
      <WarrantyQueueView />
    </Suspense>
  );
}
