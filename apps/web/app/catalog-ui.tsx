'use client';

import Link from 'next/link';
import { useState } from 'react';
import { customerNavigationForSession } from '@/components/storefront/storefront-navigation';
import type { PublicMedia } from '../lib/catalog-api';
import { useAuth } from './auth-provider';
import { useCommerce } from './commerce-provider';

export function CatalogHeader() {
  const { status, user } = useAuth();
  const { totalQuantity } = useCommerce();
  const customerNavigation = customerNavigationForSession(status, user?.role);
  const audience =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN')
      ? 'backoffice'
      : 'customer';
  return (
    <header className="site-header" data-audience={audience}>
      <Link className="brand" href="/">
        rePhone
      </Link>
      <nav aria-label="Điều hướng chính">
        <Link href="/products">Sản phẩm</Link>
        <Link href="/vouchers">Ưu đãi</Link>
        {status !== 'authenticated' || user?.role === 'CUSTOMER' ? (
          <Link href="/cart">
            Giỏ hàng <span className="cart-badge">{totalQuantity}</span>
          </Link>
        ) : null}
        {customerNavigation.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
        {status === 'authenticated' && user?.role === 'CUSTOMER' ? (
          <Link href="/after-sales">Hậu mãi</Link>
        ) : null}
        {status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN') ? (
          <>
            <Link href="/backoffice/orders">Đơn hàng</Link>
            <Link href="/backoffice/payments">Duyệt cọc</Link>
            <Link href="/backoffice/refunds">Hoàn tiền</Link>
            <Link href="/backoffice/after-sales">Hậu mãi</Link>
            <Link href="/backoffice/customers">Khách hàng</Link>
          </>
        ) : null}
        {status === 'authenticated' && user?.role === 'ADMIN' ? (
          <>
            <Link href="/backoffice/employees">Nhân viên</Link>
            <Link href="/backoffice/settings">Cấu hình</Link>
            <Link href="/backoffice/audit-logs">Nhật ký</Link>
          </>
        ) : null}
        {status === 'anonymous' ? <Link href="/login">Đăng nhập</Link> : null}
      </nav>
    </header>
  );
}

export function MediaImage({
  media,
  className,
}: {
  media?: PublicMedia | undefined;
  className?: string | undefined;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (media === undefined || failedUrl === media.url) {
    return <div className={`media-placeholder ${className ?? ''}`} aria-hidden="true" />;
  }
  return (
    <img
      className={className}
      src={media.url}
      alt={media.altText}
      width={media.width ?? 800}
      height={media.height ?? 800}
      onError={() => {
        setFailedUrl(media.url);
      }}
    />
  );
}

export function Money({ value }: { value?: string | undefined }) {
  return <>{value === undefined ? 'Liên hệ' : `${formatMoney(value)} ₫`}</>;
}

export function Availability({ available }: { available: boolean }) {
  return (
    <span className={available ? 'availability available' : 'availability unavailable'}>
      {available ? 'Còn hàng' : 'Tạm hết hàng'}
    </span>
  );
}

export function formatMoney(value: string): string {
  try {
    return new Intl.NumberFormat('vi-VN').format(BigInt(value));
  } catch {
    return value;
  }
}
