import type { ReactNode } from 'react';
import { CustomerPostPurchaseFrame } from '@/components/post-purchase';

export default function PostPurchaseLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <CustomerPostPurchaseFrame>{children}</CustomerPostPurchaseFrame>;
}
