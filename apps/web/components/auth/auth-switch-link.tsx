'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@/components/ui';
import { safeAuthReturnTo } from './auth-route-guard';

export function AuthSwitchLink({
  destination,
  children,
  standalone = false,
}: {
  destination: '/login' | '/register';
  children: ReactNode;
  standalone?: boolean;
}) {
  const [href, setHref] = useState<string>(destination);
  useEffect(() => {
    const next = safeAuthReturnTo(
      new URLSearchParams(window.location.search).get('returnTo'),
      'CUSTOMER',
    );
    setHref(next ? `${destination}?returnTo=${encodeURIComponent(next)}` : destination);
  }, [destination]);
  return (
    <Link href={href} standalone={standalone}>
      {children}
    </Link>
  );
}
