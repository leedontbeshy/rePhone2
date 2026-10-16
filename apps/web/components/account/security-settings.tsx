'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import { PasswordInput } from '@/components/auth/password-fields';
import { Button, ErrorSummary, InlineAlert, Link, type ErrorSummaryItem } from '@/components/ui';
import { AccountRequestError, changeAccountPassword, type PasswordChange } from '@/lib/account-api';
import styles from './account.module.css';
import { AccountAnonymousState, AccountLoadingState, AccountPageHeader } from './account-states';

type PasswordField = keyof PasswordChange | 'confirmation';
type PasswordErrors = Partial<Record<PasswordField, string>>;

export function SecuritySettings() {
  const { status, user } = useAuth();
  const ownerId = status === 'authenticated' ? (user?.id ?? null) : null;
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const [complete, setComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ownerId !== null) {
      setComplete(false);
      setCompleting(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (complete) window.requestAnimationFrame(() => successRef.current?.focus());
  }, [complete]);

  return (
    <div className={styles.page}>
      <AccountPageHeader
        eyebrow="Tài khoản"
        title="Bảo mật"
        description="Cập nhật mật khẩu để bảo vệ tài khoản của bạn."
      />
      {complete && ownerId === null ? (
        <section className={styles.panel}>
          <div ref={successRef} className={styles.successState} tabIndex={-1}>
            <InlineAlert tone="success" role="status" title="Đã đổi mật khẩu">
              Bạn đã được đăng xuất khỏi tất cả thiết bị. Hãy đăng nhập lại bằng mật khẩu mới.
            </InlineAlert>
            <div className={styles.stateActions}>
              <Link href="/login" standalone>
                Đăng nhập lại
              </Link>
            </div>
          </div>
        </section>
      ) : status === 'loading' || completing ? (
        <AccountLoadingState label="Đang kiểm tra trạng thái đăng nhập" />
      ) : status === 'anonymous' ? (
        <AccountAnonymousState returnTo="/account/security" />
      ) : ownerId !== null ? (
        <PasswordForm
          key={ownerId}
          canShowCompletion={() => ownerIdRef.current === null}
          isCurrentOwner={() => ownerIdRef.current === ownerId}
          onCompleting={() => {
            setCompleting(true);
          }}
          onComplete={() => {
            setComplete(true);
            setCompleting(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PasswordForm({
  canShowCompletion,
  isCurrentOwner,
  onComplete,
  onCompleting,
}: Readonly<{
  canShowCompletion: () => boolean;
  isCurrentOwner: () => boolean;
  onComplete: () => void;
  onCompleting: () => void;
}>) {
  const { client, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [requestError, setRequestError] = useState<AccountRequestError | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const input: PasswordChange = { currentPassword, newPassword };
    const nextErrors = validatePasswordChange(input, confirmation);
    setErrors(nextErrors);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusSummary(summaryRef);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    try {
      await changeAccountPassword(client, input);
      if (!isCurrentOwner()) return;
      onCompleting();
      await settleLogoutBeforeCompletion(logout, () => {
        if (canShowCompletion()) onComplete();
      });
    } catch (caught) {
      if (!isCurrentOwner()) return;
      const issue = asAccountError(caught, 'Không thể đổi mật khẩu.');
      const fieldErrors = passwordFieldErrors(issue);
      setErrors(fieldErrors);
      setRequestError(issue);
      focusSummary(summaryRef);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function clearFieldIssue(field: PasswordField) {
    setErrors((current) => {
      if (current[field] === undefined) return current;
      return Object.fromEntries(
        Object.entries(current).filter(([candidate]) => candidate !== field),
      );
    });
    setRequestError(null);
  }

  const summaryErrors: ErrorSummaryItem[] = Object.entries(errors).map(([field, message]) => ({
    href: `#password-${field}` as `#${string}`,
    message,
  }));
  if (requestError !== null && summaryErrors.length === 0) {
    summaryErrors.push({ message: requestError.message });
  }

  return (
    <section
      className={[styles.panel, styles.passwordPanel].join(' ')}
      aria-labelledby="password-form-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="password-form-title">Đổi mật khẩu</h2>
          <p>Nhập mật khẩu hiện tại, sau đó tạo mật khẩu mới.</p>
        </div>
      </div>
      <form
        className={styles.form}
        noValidate
        aria-busy={pending || undefined}
        onSubmit={(event) => void submit(event)}
      >
        <ErrorSummary ref={summaryRef} errors={summaryErrors} />
        <PasswordInput
          id="password-currentPassword"
          label="Mật khẩu hiện tại"
          value={currentPassword}
          autoComplete="current-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
          error={errors.currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.currentTarget.value);
            clearFieldIssue('currentPassword');
          }}
        />
        <PasswordInput
          id="password-newPassword"
          label="Mật khẩu mới"
          value={newPassword}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
          error={errors.newPassword}
          hint="Từ 8 đến 128 ký tự, có ít nhất một chữ và một số; không bắt đầu hoặc kết thúc bằng khoảng trắng."
          onChange={(event) => {
            setNewPassword(event.currentTarget.value);
            clearFieldIssue('newPassword');
          }}
        />
        <PasswordInput
          id="password-confirmation"
          label="Nhập lại mật khẩu mới"
          value={confirmation}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
          error={errors.confirmation}
          onChange={(event) => {
            setConfirmation(event.currentTarget.value);
            clearFieldIssue('confirmation');
          }}
        />
        <div className={styles.formActions}>
          <Button type="submit" loading={pending} loadingLabel="Đang đổi mật khẩu">
            Đổi mật khẩu
          </Button>
        </div>
      </form>
    </section>
  );
}

export async function settleLogoutBeforeCompletion(
  logout: () => Promise<void>,
  onComplete: () => void,
) {
  try {
    await logout();
  } catch {
    // Password change already revoked sessions and cleared the refresh cookie.
    // AuthProvider also clears the in-memory access token before its logout request.
  }
  onComplete();
}

export function validatePasswordChange(
  input: PasswordChange,
  confirmation: string,
): PasswordErrors {
  const errors: PasswordErrors = {};
  if (input.currentPassword.length < 8 || input.currentPassword.length > 128) {
    errors.currentPassword = 'Mật khẩu hiện tại phải từ 8 đến 128 ký tự.';
  }
  if (input.newPassword.length < 8 || input.newPassword.length > 128) {
    errors.newPassword = 'Mật khẩu mới phải từ 8 đến 128 ký tự.';
  } else if (!/[A-Za-z]/.test(input.newPassword) || !/\d/.test(input.newPassword)) {
    errors.newPassword = 'Mật khẩu mới phải có ít nhất một chữ và một số.';
  } else if (/^\s|\s$/.test(input.newPassword)) {
    errors.newPassword = 'Mật khẩu mới không được bắt đầu hoặc kết thúc bằng khoảng trắng.';
  }
  if (confirmation !== input.newPassword) {
    errors.confirmation = 'Mật khẩu nhập lại chưa khớp.';
  }
  return errors;
}

function passwordFieldErrors(error: AccountRequestError): PasswordErrors {
  if (error.code === 'CURRENT_PASSWORD_INCORRECT') {
    return { currentPassword: 'Mật khẩu hiện tại không đúng.' };
  }
  return Object.fromEntries(
    error.details
      .filter(
        (detail): detail is typeof detail & { field: keyof PasswordChange } =>
          detail.field === 'currentPassword' || detail.field === 'newPassword',
      )
      .map((detail) => [detail.field, detail.message]),
  );
}

function asAccountError(caught: unknown, fallback: string): AccountRequestError {
  return caught instanceof AccountRequestError ? caught : new AccountRequestError(fallback);
}

function focusSummary(ref: Readonly<{ current: HTMLDivElement | null }>) {
  window.requestAnimationFrame(() => ref.current?.focus());
}
