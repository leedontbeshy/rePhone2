import type { ReactNode } from 'react';
import { Button, InlineAlert, Link, Skeleton } from '@/components/ui';
import type { AccountRequestError } from '@/lib/account-api';
import styles from './account.module.css';

export function AccountPageHeader({
  eyebrow,
  title,
  description,
  action,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}>) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderCopy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.description}>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function AccountLoadingState({ label }: Readonly<{ label: string }>) {
  return (
    <section className={styles.loadingCard} aria-busy="true" aria-label={label} role="status">
      <span className="rp-visually-hidden">{label}</span>
      <Skeleton height="1.75rem" width="44%" />
      <div className={styles.loadingLines}>
        <Skeleton height="4.5rem" />
        <Skeleton height="4.5rem" />
        <Skeleton height="4.5rem" />
        <Skeleton height="4.5rem" />
      </div>
    </section>
  );
}

export function AccountAnonymousState({ returnTo = '/account' }: Readonly<{ returnTo?: string }>) {
  return (
    <section className={styles.emptyState}>
      <h2>Đăng nhập để quản lý tài khoản</h2>
      <p>Đăng nhập giúp rePhone bảo vệ hồ sơ, mật khẩu và địa chỉ của bạn.</p>
      <div className={styles.stateActions}>
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} standalone>
          Đăng nhập
        </Link>
      </div>
    </section>
  );
}

export function AccountPermissionState() {
  return (
    <InlineAlert title="Khu vực dành cho khách hàng" tone="warning" role="alert">
      Tài khoản nhân viên không có sổ địa chỉ giao hàng. Bạn vẫn có thể cập nhật hồ sơ và mật khẩu
      trong các mục còn lại.
    </InlineAlert>
  );
}

export function AccountLoadError({
  error,
  onRetry,
}: Readonly<{ error: AccountRequestError; onRetry: () => void }>) {
  const title = error.isForbidden ? 'Bạn không có quyền truy cập' : 'Chưa tải được dữ liệu';
  return (
    <InlineAlert title={title} tone={error.isForbidden ? 'warning' : 'danger'} role="alert">
      <p>{error.message}</p>
      {!error.isForbidden ? (
        <div className={styles.stateActions}>
          <Button variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      ) : null}
    </InlineAlert>
  );
}

export function MutationError({ error }: Readonly<{ error: AccountRequestError }>) {
  return (
    <InlineAlert
      title={error.isConflict ? 'Dữ liệu vừa thay đổi' : 'Chưa lưu được thay đổi'}
      tone={error.isConflict ? 'warning' : 'danger'}
      role="alert"
    >
      {error.isConflict
        ? 'Hãy tải lại dữ liệu mới nhất rồi thực hiện lại thao tác.'
        : error.message}
    </InlineAlert>
  );
}
