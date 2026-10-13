import type { ReactNode } from 'react';
import { BackofficePendingTasksProvider } from '@/components/backoffice/backoffice-pending-tasks';

export default function BackofficeLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <BackofficePendingTasksProvider>{children}</BackofficePendingTasksProvider>;
}
