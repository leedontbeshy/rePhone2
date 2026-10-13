'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@/components/ui';
import { safeAuthReturnTo } from './auth-route-guard';

export function AuthSwitchLink({
  destination,
  children,
  standalone = false,
  current = false,
  className,
}: {
  destination: '/login' | '/register';
  children: ReactNode;
  standalone?: boolean;
  current?: boolean;
  className?: string | undefined;
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
    <Link
      href={href}
      prefetch={false}
      standalone={standalone}
      aria-current={current ? 'page' : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
