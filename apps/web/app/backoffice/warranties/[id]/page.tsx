'use client';

import { useParams } from 'next/navigation';
import { WarrantyDetailView } from '@/components/backoffice/operations/warranties/warranty-detail-view';

export default function BackofficeWarrantyDetailPage() {
  const params = useParams<{ id: string }>();
  return <WarrantyDetailView warrantyId={decodeURIComponent(params.id)} />;
}
