import Link from 'next/link';
import type { PublicMedia } from '../lib/catalog-api';

export function CatalogHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        rePhone
      </Link>
      <nav aria-label="Điều hướng chính">
        <Link href="/products">Sản phẩm</Link>
        <Link href="/login">Đăng nhập</Link>
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
  if (media === undefined) {
    return <div className={`media-placeholder ${className ?? ''}`} aria-hidden="true" />;
  }
  return (
    <img
      className={className}
      src={media.url}
      alt={media.altText}
      width={media.width ?? 800}
      height={media.height ?? 800}
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
