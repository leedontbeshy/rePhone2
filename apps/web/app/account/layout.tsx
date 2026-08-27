import type { ReactNode } from 'react';
import { AccountShell } from '@/components/account/account-shell';

export default function AccountLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AccountShell>{children}</AccountShell>;
}
