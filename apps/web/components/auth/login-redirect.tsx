'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { safeAuthReturnTo } from './auth-route-guard';
export function LoginRedirect({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  useEffect(() => {
    const destination = safeAuthReturnTo(returnTo, 'CUSTOMER') ?? '/account';
    router.replace(`/login?returnTo=${encodeURIComponent(destination)}`);
  }, [returnTo, router]);
  return (
    <span className="rp-visually-hidden" role="status">
      Đang mở trang đăng nhập…
    </span>
  );
}
