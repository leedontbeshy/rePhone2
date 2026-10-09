'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type AuthRole } from '@/app/auth-provider';
import { AuthPage, AuthPending } from './auth-page';

interface AnonymousAuthGateProps {
  children: ReactNode;
  description?: ReactNode;
  title: string;
}

export function AnonymousAuthGate({
  children,
  description,
  title,
}: Readonly<AnonymousAuthGateProps>) {
  const router = useRouter();
  const { logoutPending, status, user } = useAuth();

  useEffect(() => {
    if (status === 'authenticated' && user !== null) {
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      router.replace(authDestination(user.role, returnTo));
    }
  }, [router, status, user]);

  if (status === 'anonymous' && !logoutPending) return children;

  return (
    <AuthPage title={title} description={description}>
      <AuthPending>
        {logoutPending
          ? 'Đang đăng xuất…'
          : status === 'loading'
            ? 'Đang kiểm tra bạn đã đăng nhập chưa…'
            : 'Đang mở tài khoản của bạn…'}
      </AuthPending>
    </AuthPage>
  );
}

export function authDestination(role: AuthRole, returnTo?: string | null): string {
  return safeAuthReturnTo(returnTo, role) ?? (role === 'CUSTOMER' ? '/account' : '/backoffice');
}

const CUSTOMER_RETURN_PATHS = [
  '/account',
  '/affiliate',
  '/after-sales',
  '/cart',
  '/checkout',
  '/dealer',
  '/orders',
  '/warranties',
  '/wishlist',
] as const;

export function safeAuthReturnTo(
  returnTo: string | null | undefined,
  role: AuthRole,
): string | null {
  if (
    returnTo === undefined ||
    returnTo === null ||
    !returnTo.startsWith('/') ||
    returnTo.startsWith('//') ||
    returnTo.includes('\\') ||
    containsControlCharacter(returnTo)
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(returnTo, 'https://rephone.local');
  } catch {
    return null;
  }
  if (url.origin !== 'https://rephone.local' || url.hash.length > 0) return null;

  const allowed =
    role === 'CUSTOMER'
      ? CUSTOMER_RETURN_PATHS.some(
          (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
        )
      : url.pathname === '/backoffice' || url.pathname.startsWith('/backoffice/');
  return allowed ? `${url.pathname}${url.search}` : null;
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32);
}
