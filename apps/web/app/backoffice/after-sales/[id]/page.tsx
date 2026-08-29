'use client';

import { useParams } from 'next/navigation';
import { AfterSalesDetailView } from '@/components/backoffice/operations/after-sales/after-sales-detail-view';

export default function BackofficeAfterSalesDetailPage() {
  const params = useParams<{ id: string }>();
  return <AfterSalesDetailView caseId={params.id} />;
}
