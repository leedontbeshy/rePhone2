'use client';

import type { ReactNode } from 'react';
import { BackofficeAccessGate } from '@/components/backoffice/backoffice-access-gate';
import { BackofficePendingTasksProvider } from '@/components/backoffice/backoffice-pending-tasks';

export default function BackofficeLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <BackofficeAccessGate>
      <BackofficePendingTasksProvider>{children}</BackofficePendingTasksProvider>
    </BackofficeAccessGate>
  );
}
