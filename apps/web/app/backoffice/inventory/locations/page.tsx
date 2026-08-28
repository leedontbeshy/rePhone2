'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { InventoryShell } from '@/components/backoffice';
import { InventoryLocationsView } from '@/components/backoffice/inventory/locations/inventory-locations-view';
import { listInventoryLocations, type InventoryLocation } from '@/lib/backoffice-inventory-api';

export default function InventoryLocationsPage() {
  const { client, status, user } = useAuth();
  const canLoad =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');
  const [locations, setLocations] = useState<readonly InventoryLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listInventoryLocations(client, { signal: controller.signal })
      .then(setLocations)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Không thể tải địa điểm.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [canLoad, client]);

  return (
    <InventoryShell breadcrumbs={[{ label: 'Kho hàng' }, { label: 'Địa điểm' }]}>
      <InventoryLocationsView error={error} loading={loading} locations={locations} />
    </InventoryShell>
  );
}
