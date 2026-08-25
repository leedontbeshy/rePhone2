import type { ReactNode } from 'react';
import { StorefrontFrame } from '@/components/storefront/storefront-frame';

export default function StorefrontLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <StorefrontFrame>{children}</StorefrontFrame>;
}
