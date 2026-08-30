import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { ReactNode, SyntheticEvent } from 'react';
import { Skeleton, StatusChip } from '@/components/ui';
import type { UserStatusPresentation } from './user-admin-presenter';
import { userAvatarTone, userInitials } from './user-admin-presenter';
import styles from './users.module.css';

export function UserAdminPageHeader({
  action,
  description,
  title,
}: Readonly<{ action?: ReactNode; description: string; title: string }>) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>Hệ thống</p>
        <h1>{title}</h1>
        <p className={styles.pageDescription}>{description}</p>
      </div>
      {action === undefined ? null : <div className={styles.pageAction}>{action}</div>}
    </header>
  );
}

export function UserFilterBar({
  children,
  onSubmit,
  q,
  searchLabel,
  searchPlaceholder,
  setQ,
}: Readonly<{
  children: ReactNode;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  q: string;
  searchLabel: string;
  searchPlaceholder: string;
  setQ: (value: string) => void;
}>) {
  return (
    <form className={styles.filters} aria-label="Bộ lọc" onSubmit={onSubmit}>
      <div className={styles.searchControl}>
        <label className="rp-visually-hidden" htmlFor="user-admin-search">
          {searchLabel}
        </label>
        <MagnifyingGlassIcon aria-hidden="true" size={20} />
        <input
          id="user-admin-search"
          maxLength={100}
          placeholder={searchPlaceholder}
          type="search"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
          }}
        />
      </div>
      {children}
      <button className="rp-visually-hidden" type="submit">
        Áp dụng bộ lọc
      </button>
    </form>
  );
}

export function UserStatusSelect({
  children,
  label,
  value,
  onChange,
}: Readonly<{
  children: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <div className={styles.selectControl}>
      <label className="rp-visually-hidden" htmlFor="user-admin-status">
        {label}
      </label>
      <select
        id="user-admin-status"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {children}
      </select>
    </div>
  );
}

export function UserSortSelect({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: 'createdAt' | 'lastLoginAt';
  onChange: (value: 'createdAt' | 'lastLoginAt') => void;
}>) {
  return (
    <div className={styles.selectControl}>
      <label className="rp-visually-hidden" htmlFor="user-admin-sort">
        {label}
      </label>
      <select
        id="user-admin-sort"
        value={value}
        onChange={(event) => {
          onChange(event.target.value === 'lastLoginAt' ? 'lastLoginAt' : 'createdAt');
        }}
      >
        <option value="createdAt">Mới tạo gần đây</option>
        <option value="lastLoginAt">Đăng nhập gần đây</option>
      </select>
    </div>
  );
}

export function UserAvatar({
  fullName,
  identity,
  large = false,
}: Readonly<{
  fullName: string;
  identity: string;
  large?: boolean;
}>) {
  return (
    <span
      aria-hidden="true"
      className={large ? styles.avatarLarge : styles.avatar}
      data-tone={userAvatarTone(identity)}
    >
      {userInitials(fullName)}
    </span>
  );
}

export function UserRecordButton({
  detailId,
  disabled,
  email,
  fullName,
  identity,
  metadata,
  selected,
  status,
  onSelect,
}: Readonly<{
  detailId: string;
  disabled?: boolean;
  email: string;
  fullName: string;
  identity: string;
  metadata?: ReactNode;
  selected: boolean;
  status: UserStatusPresentation;
  onSelect: () => void;
}>) {
  return (
    <button
      aria-controls={detailId}
      aria-current={selected ? 'true' : undefined}
      className={styles.recordButton}
      data-selected={selected || undefined}
      disabled={disabled}
      type="button"
      onClick={onSelect}
    >
      <UserAvatar fullName={fullName} identity={identity} />
      <span className={styles.recordIdentity}>
        <strong>{fullName}</strong>
        <span>{email}</span>
        {metadata === undefined ? null : <small>{metadata}</small>}
      </span>
      <StatusChip label={status.label} tone={status.tone} />
    </button>
  );
}

export function UserListPanel({
  children,
  footer,
  loading,
  title,
  titleId = 'user-list-title',
}: Readonly<{
  children: ReactNode;
  footer?: ReactNode;
  loading: boolean;
  title: string;
  titleId?: string;
}>) {
  return (
    <section
      className={styles.listPanel}
      aria-busy={loading || undefined}
      aria-labelledby={titleId}
    >
      <div className={styles.panelHeading}>
        <h2 id={titleId} tabIndex={-1}>
          {title}
        </h2>
        {loading ? <span role="status">Đang cập nhật…</span> : null}
      </div>
      <div className={styles.recordList}>{children}</div>
      {footer === undefined ? null : <div className={styles.listFooter}>{footer}</div>}
    </section>
  );
}

export function UserDetailIdentity({
  aside,
  email,
  fullName,
  identity,
  status,
}: Readonly<{
  aside?: ReactNode;
  email: string;
  fullName: string;
  identity: string;
  status: UserStatusPresentation;
}>) {
  return (
    <div className={styles.detailIdentity}>
      <UserAvatar fullName={fullName} identity={identity} large />
      <div className={styles.detailIdentityCopy}>
        <h3>{fullName}</h3>
        <p>{email}</p>
        <StatusChip label={status.label} tone={status.tone} />
      </div>
      {aside === undefined ? null : <div className={styles.detailIdentityAside}>{aside}</div>}
    </div>
  );
}

export function UserDetailSummary({
  items,
}: Readonly<{
  items: readonly Readonly<{ icon: ReactNode; label: string; value: ReactNode }>[];
}>) {
  return (
    <dl className={styles.detailSummary} aria-label="Tóm tắt hồ sơ">
      {items.map((item) => (
        <div className={styles.detailSummaryItem} key={item.label}>
          <span aria-hidden="true" className={styles.detailSummaryIcon}>
            {item.icon}
          </span>
          <span className={styles.detailSummaryCopy}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}

export function UserDetailSection({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className={styles.detailSection}>
      <h3>{title}</h3>
      <dl className={styles.detailList}>{children}</dl>
    </section>
  );
}

export function UserDetailField({
  icon,
  label,
  value,
}: Readonly<{ icon?: ReactNode; label: string; value: ReactNode }>) {
  return (
    <div className={styles.detailField}>
      <dt>
        {icon === undefined ? null : (
          <span aria-hidden="true" className={styles.detailFieldIcon}>
            {icon}
          </span>
        )}
        <span>{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

export function UserAdminEmptyState({
  description,
  title,
}: Readonly<{ description: string; title: string }>) {
  return (
    <div className={styles.emptyState}>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function UserListSkeleton() {
  return (
    <div className={styles.skeletonList} aria-label="Đang tải danh sách" role="status">
      {Array.from({ length: 6 }, (_, index) => (
        <div className={styles.skeletonRow} aria-hidden="true" key={index}>
          <Skeleton height="2.75rem" width="2.75rem" />
          <span>
            <Skeleton height="1rem" width="10rem" />
            <Skeleton height="0.875rem" width="13rem" />
          </span>
          <Skeleton height="1.75rem" width="7rem" />
        </div>
      ))}
      <span className="rp-visually-hidden">Đang tải danh sách…</span>
    </div>
  );
}

export function UserDetailSkeleton() {
  return (
    <div className={styles.detailSkeleton} aria-label="Đang tải chi tiết" role="status">
      <Skeleton height="5.25rem" width="5.25rem" />
      <Skeleton height="1.5rem" width="12rem" />
      <Skeleton height="3rem" width="100%" />
      <Skeleton height="3rem" width="100%" />
      <Skeleton height="3rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải chi tiết…</span>
    </div>
  );
}
