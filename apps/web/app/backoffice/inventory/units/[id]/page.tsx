'use client';

import { useParams } from 'next/navigation';
import { InventoryUnitDetailPage } from '@/components/backoffice/inventory/units/detail/inventory-unit-detail-page';

export default function InventoryUnitPage() {
  const params = useParams<{ id: string }>();
  return <InventoryUnitDetailPage unitId={params.id} />;
}
