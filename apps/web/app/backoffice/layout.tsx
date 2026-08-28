import type { ReactNode } from 'react';
import { BackofficeAccessGate } from '@/components/backoffice';

export default function BackofficeLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <BackofficeAccessGate>{children}</BackofficeAccessGate>;
}
