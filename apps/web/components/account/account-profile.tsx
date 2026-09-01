'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth, type AuthAccountProfile } from '@/app/auth-provider';
import { Button, ErrorSummary, InlineAlert, Input, type ErrorSummaryItem } from '@/components/ui';
import {
  AccountRequestError,
  getAccount,
  updateAccount,
  type Account,
  type AccountUpdate,
} from '@/lib/account-api';
import styles from './account.module.css';
import {
  AccountAnonymousState,
  AccountLoadError,
  AccountLoadingState,
  AccountPageHeader,
} from './account-states';

type ProfileField = keyof AccountUpdate;
type ProfileErrors = Partial<Record<ProfileField, string>>;

export function AccountProfile() {
  const { client, status, user } = useAuth();
  const ownerId = status === 'authenticated' ? (user?.id ?? null) : null;
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const [accountState, setAccountState] = useState<OwnedAccountState>({
    ownerId: null,
    account: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<AccountRequestError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'anonymous') {
      setAccountState({ ownerId: null, account: null });
      setLoading(false);
      setLoadError(null);
      return;
    }

    if (ownerId === null) return;
    const requestOwnerId = ownerId;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void getAccount(client)
      .then((value) => {
        if (!active || ownerIdRef.current !== requestOwnerId) return;
        if (value.id !== requestOwnerId) {
          setAccountState({ ownerId: requestOwnerId, account: null });
          setLoadError(new AccountRequestError('Không thể xác nhận thông tin tài khoản.'));
          return;
        }
        setAccountState({ ownerId: requestOwnerId, account: value });
      })
      .catch((caught: unknown) => {
        if (active && ownerIdRef.current === requestOwnerId) {
          setAccountState((current) =>
            current.ownerId === requestOwnerId
              ? current
              : { ownerId: requestOwnerId, account: null },
          );
          setLoadError(asAccountError(caught, 'Không thể tải thông tin tài khoản.'));
        }
      })
      .finally(() => {
        if (active && ownerIdRef.current === requestOwnerId) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, ownerId, reloadKey, status]);

  const account = accountForOwner(accountState, ownerId);
  const initialLoading =
    status === 'authenticated' &&
    (accountState.ownerId !== ownerId || (loading && account === null));

  return (
    <div className={styles.page}>
      <AccountPageHeader
        eyebrow="Tài khoản"
        title="Hồ sơ của bạn"
        description="Cập nhật thông tin liên hệ dùng cho trải nghiệm mua hàng và hỗ trợ sau bán."
      />
      {status === 'loading' || initialLoading ? (
        <AccountLoadingState label="Đang tải hồ sơ tài khoản" />
      ) : status === 'anonymous' ? (
        <AccountAnonymousState returnTo="/account" />
      ) : loadError !== null ? (
        <AccountLoadError
          error={loadError}
          onRetry={() => {
            setReloadKey((value) => value + 1);
          }}
        />
      ) : account !== null ? (
        <ProfileEditor
          key={ownerId ?? account.id}
          account={account}
          onUpdated={(updated) => {
            if (ownerId === null || updated.id !== ownerId) return;
            setAccountState((current) =>
              acceptAccountForOwner(current, ownerId, ownerIdRef.current, updated),
            );
          }}
        />
      ) : null}
    </div>
  );
}

export interface OwnedAccountState {
  ownerId: string | null;
  account: Account | null;
}

export function accountForOwner(state: OwnedAccountState, ownerId: string | null): Account | null {
  return state.ownerId === ownerId ? state.account : null;
}

export function acceptAccountForOwner(
  state: OwnedAccountState,
  requestOwnerId: string,
  currentOwnerId: string | null,
  account: Account,
): OwnedAccountState {
  return requestOwnerId === currentOwnerId && account.id === requestOwnerId
    ? { ownerId: requestOwnerId, account }
    : state;
}

function ProfileEditor({
  account,
  onUpdated,
}: Readonly<{ account: Account; onUpdated: (account: Account) => void }>) {
  const { client, syncAccountProfile } = useAuth();
  const [fullName, setFullName] = useState(account.fullName);
  const [phone, setPhone] = useState(account.phone ?? '');
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requestError, setRequestError] = useState<AccountRequestError | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const input: AccountUpdate = { fullName: fullName.trim(), phone: phone.trim() || null };
    const nextErrors = validateProfile(input);
    setErrors(nextErrors);
    setSaved(false);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusSummary(summaryRef);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    try {
      const updated = await updateAccount(client, input);
      const accepted = commitProfileUpdate(updated, account.id, onUpdated, syncAccountProfile);
      if (!accepted) {
        throw new AccountRequestError(
          'Không thể xác nhận thông tin vừa lưu. Hãy tải lại trang rồi thử lại.',
        );
      }
      setFullName(updated.fullName);
      setPhone(updated.phone ?? '');
      setSaved(true);
    } catch (caught) {
      const issue = asAccountError(caught, 'Không thể cập nhật thông tin tài khoản.');
      const fieldErrors = profileFieldErrors(issue);
      setErrors(fieldErrors);
      setRequestError(issue);
      focusSummary(summaryRef);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function clearFieldIssue(field: ProfileField) {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      return Object.fromEntries(
        Object.entries(current).filter(([candidate]) => candidate !== field),
      );
    });
    setRequestError(null);
    setSaved(false);
  }

  const summaryErrors: ErrorSummaryItem[] = Object.entries(errors).map(([field, message]) => ({
    href: `#account-${field}` as `#${string}`,
    message,
  }));
  if (requestError !== null && summaryErrors.length === 0) {
    summaryErrors.push({
      message: requestError.isConflict
        ? 'Dữ liệu vừa thay đổi. Tải lại hồ sơ rồi thử lại.'
        : requestError.message,
    });
  }

  return (
    <>
      <AccountSummary account={account} />
      <section className={styles.panel} aria-labelledby="profile-form-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="profile-form-title">Thông tin liên hệ</h2>
            <p>Email và thông tin tài khoản được quản lý riêng, không thể đổi tại đây.</p>
          </div>
        </div>
        <form
          className={styles.form}
          noValidate
          aria-busy={pending || undefined}
          onSubmit={(event) => void submit(event)}
        >
          <ErrorSummary
            ref={summaryRef}
            errors={summaryErrors}
            {...(requestError?.isConflict ? { title: 'Dữ liệu vừa thay đổi' } : {})}
          />
          {saved ? (
            <InlineAlert tone="success" role="status" title="Đã lưu hồ sơ">
              Thông tin liên hệ của bạn đã được cập nhật.
            </InlineAlert>
          ) : null}
          <div className={styles.formGrid}>
            <Input
              id="account-fullName"
              label="Họ và tên"
              value={fullName}
              error={errors.fullName}
              autoComplete="name"
              maxLength={255}
              required
              disabled={pending}
              onChange={(event) => {
                setFullName(event.currentTarget.value);
                clearFieldIssue('fullName');
              }}
            />
            <Input
              id="account-phone"
              label="Số điện thoại"
              value={phone}
              error={errors.phone}
              autoComplete="tel"
              inputMode="tel"
              maxLength={32}
              disabled={pending}
              hint="Để trống nếu bạn chưa muốn lưu số điện thoại."
              onChange={(event) => {
                setPhone(event.currentTarget.value);
                clearFieldIssue('phone');
              }}
            />
          </div>
          <div className={styles.formActions}>
            <Button type="submit" loading={pending} loadingLabel="Đang lưu hồ sơ">
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}

export function commitProfileUpdate(
  account: Account,
  expectedOwnerId: string,
  onUpdated: (account: Account) => void,
  syncAccountProfile: (profile: AuthAccountProfile) => void,
): boolean {
  if (account.id !== expectedOwnerId) return false;
  onUpdated(account);
  syncAccountProfile({
    id: account.id,
    fullName: account.fullName,
    phone: account.phone ?? null,
  });
  return true;
}

export function AccountSummary({ account }: Readonly<{ account: Account }>) {
  return (
    <section className={styles.panel} aria-labelledby="account-summary-title">
      <h2 id="account-summary-title">Thông tin tài khoản</h2>
      <dl className={styles.summaryGrid}>
        <SummaryItem label="Email" value={account.email} />
        <SummaryItem label="Loại tài khoản" value={roleLabel(account.role)} />
        <SummaryItem label="Tình trạng tài khoản" value={statusLabel(account.status)} />
        <SummaryItem
          label="Email đã xác nhận"
          value={account.emailVerifiedAt ? formatDate(account.emailVerifiedAt) : 'Chưa xác nhận'}
        />
        {account.staffProfile ? (
          <>
            <SummaryItem label="Mã nhân viên" value={account.staffProfile.employeeCode} />
            <SummaryItem
              label="Ngày vào làm"
              value={account.staffProfile.hiredAt ? formatDate(account.staffProfile.hiredAt) : '—'}
            />
          </>
        ) : null}
      </dl>
    </section>
  );
}

function SummaryItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function validateProfile(input: AccountUpdate): ProfileErrors {
  const errors: ProfileErrors = {};
  const fullName = input.fullName?.trim() ?? '';
  if (fullName.length === 0) errors.fullName = 'Nhập họ và tên.';
  else if (fullName.length > 255) errors.fullName = 'Họ và tên không được quá 255 ký tự.';

  if (input.phone !== undefined && input.phone !== null) {
    const phone = input.phone.trim();
    if (phone.length === 0) errors.phone = 'Nhập số điện thoại hoặc để trống trường này.';
    else if (phone.length > 32) errors.phone = 'Số điện thoại không được quá 32 ký tự.';
  }
  return errors;
}

function profileFieldErrors(error: AccountRequestError): ProfileErrors {
  const errors: ProfileErrors = {};
  for (const detail of error.details) {
    if (detail.field === 'fullName' || detail.field === 'phone') {
      errors[detail.field] = detail.message;
    }
  }
  return errors;
}

function roleLabel(role: Account['role']): string {
  return role === 'CUSTOMER' ? 'Khách hàng' : role === 'EMPLOYEE' ? 'Nhân viên' : 'Quản trị viên';
}

function statusLabel(status: Account['status']): string {
  const labels: Record<Account['status'], string> = {
    ACTIVE: 'Đang hoạt động',
    DISABLED: 'Đã vô hiệu hóa',
    PENDING_VERIFICATION: 'Chờ xác minh',
    SUSPENDED: 'Đang tạm ngưng',
  };
  return labels[status];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function asAccountError(caught: unknown, fallback: string): AccountRequestError {
  return caught instanceof AccountRequestError ? caught : new AccountRequestError(fallback);
}

function focusSummary(ref: Readonly<{ current: HTMLDivElement | null }>) {
  window.requestAnimationFrame(() => ref.current?.focus());
}
