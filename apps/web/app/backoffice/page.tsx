'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { CatalogVoucherShell } from '@/components/backoffice';
import {
  OperationsOverview,
  type OperationsOverviewSnapshot,
} from '@/components/backoffice/overview';
import { getBackofficeOverview } from '@/lib/backoffice-overview-api';

export default function BackofficeOverviewPage() {
  const { client, status, user } = useAuth();
  const canViewOverview =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');
  const snapshotRef = useRef<OperationsOverviewSnapshot | null>(null);
  const [snapshot, setSnapshot] = useState<OperationsOverviewSnapshot | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!canViewOverview) return;
    const controller = new AbortController();
    const hasSnapshot = snapshotRef.current !== null;
    setError(null);
    setInitialLoading(!hasSnapshot);
    setRefreshing(hasSnapshot);

    void getBackofficeOverview(client, controller.signal)
      .then((nextSnapshot) => {
        if (controller.signal.aborted) return;
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setError(caught instanceof Error ? caught.message : 'Không thể tải tổng quan vận hành.');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setInitialLoading(false);
        setRefreshing(false);
      });

    return () => {
      controller.abort();
    };
  }, [canViewOverview, client, requestVersion]);

  const refresh = useCallback(() => {
    setRequestVersion((current) => current + 1);
  }, []);

  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Vận hành' }, { label: 'Tổng quan' }]}>
      <OperationsOverview
        error={error}
        initialLoading={initialLoading}
        refreshing={refreshing}
        role={user?.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE'}
        snapshot={snapshot}
        onRefresh={refresh}
      />
    </CatalogVoucherShell>
  );
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
}
