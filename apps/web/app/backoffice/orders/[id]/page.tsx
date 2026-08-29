'use client';

import { useParams } from 'next/navigation';
import { OrderDetailView } from '@/components/backoffice/operations/orders';

export default function BackofficeOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = decodeURIComponent(params.id);
  return <OrderDetailView key={orderId} orderId={orderId} />;
}
