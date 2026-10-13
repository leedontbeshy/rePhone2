'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/auth-provider';
import {
  getBackofficePendingTasks,
  watchBackofficePendingTasks,
  type PendingTaskCounts,
} from '@/lib/backoffice-pending-tasks';

const PendingTasksContext = createContext<PendingTaskCounts | null>(null);

export function BackofficePendingTasksProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, status, user } = useAuth();
  const owner =
    status === 'authenticated' && (user?.role === 'ADMIN' || user?.role === 'EMPLOYEE')
      ? `${user.id}:${user.role}`
      : null;
  return (
    <PendingTasksSession key={owner ?? 'anonymous'} client={client} enabled={owner !== null}>
      {children}
    </PendingTasksSession>
  );
}

function PendingTasksSession({
  client,
  enabled,
  children,
}: Readonly<{
  client: ReturnType<typeof useAuth>['client'];
  enabled: boolean;
  children: ReactNode;
}>) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<PendingTaskCounts | null>(null);

  useEffect(() => {
    if (!enabled) return;
    return watchBackofficePendingTasks(
      (signal) => getBackofficePendingTasks(client, signal),
      setCounts,
    );
  }, [client, enabled, pathname]);

  return <PendingTasksContext.Provider value={counts}>{children}</PendingTasksContext.Provider>;
}

export function useBackofficePendingTasks(): PendingTaskCounts | null {
  return useContext(PendingTasksContext);
}
