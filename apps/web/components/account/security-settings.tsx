'use client';

import { useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  Button,
  ErrorSummary,
  InlineAlert,
  Input,
  Link,
  type ErrorSummaryItem,
} from '@/components/ui';
import { AccountRequestError, changeAccountPassword, type PasswordChange } from '@/lib/account-api';
import styles from './account.module.css';
import { AccountAnonymousState, AccountLoadingState, AccountPageHeader } from './account-states';

type PasswordField = keyof PasswordChange | 'confirmation';
type PasswordErrors = Partial<Record<PasswordField, string>>;

export function SecuritySettings() {
  const { status } = useAuth();
  const [complete, setComplete] = useState(false);

  return (
    <div className={styles.page}>
      <AccountPageHeader
        eyebrow="Tài khoản"
        title="Bảo mật"
        description="Đổi mật khẩu sẽ thu hồi mọi phiên đăng nhập để bảo vệ tài khoản của bạn."
      />
      {complete ? (
        <section className={styles.panel}>
          <div className={styles.successState}>
            <InlineAlert tone="success" role="status" title="Đã đổi mật khẩu">
              Tất cả phiên đăng nhập đã bị thu hồi. Hãy đăng nhập lại bằng mật khẩu mới.
            </InlineAlert>
            <div className={styles.stateActions}>
              <Link href="/login" standalone>
                Đăng nhập lại
              </Link>
            </div>
          </div>
        </section>
      ) : status === 'loading' ? (
        <AccountLoadingState label="Đang kiểm tra phiên đăng nhập" />
      ) : status === 'anonymous' ? (
        <AccountAnonymousState returnTo="/account/security" />
      ) : (
        <PasswordForm
          onComplete={() => {
            setComplete(true);
          }}
        />
      )}
    </div>
  );
}

function PasswordForm({ onComplete }: Readonly<{ onComplete: () => void }>) {
  const { client, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [requestError, setRequestError] = useState<AccountRequestError | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const input: PasswordChange = { currentPassword, newPassword };
    const nextErrors = validatePasswordChange(input, confirmation);
    setErrors(nextErrors);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusSummary(summaryRef);
      return;
    }

    setPending(true);
    try {
      await changeAccountPassword(client, input);
      await settleLogoutBeforeCompletion(logout, onComplete);
    } catch (caught) {
      const issue = asAccountError(caught, 'Không thể đổi mật khẩu.');
      const fieldErrors = passwordFieldErrors(issue);
      setErrors(fieldErrors);
      setRequestError(issue);
      focusSummary(summaryRef);
    } finally {
      setPending(false);
    }
  }

  const summaryErrors: ErrorSummaryItem[] = Object.entries(errors).map(([field, message]) => ({
    href: `#password-${field}` as `#${string}`,
    message,
  }));
  if (requestError !== null && summaryErrors.length === 0) {
    summaryErrors.push({ message: requestError.message });
  }

  return (
    <section className={styles.panel} aria-labelledby="password-form-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="password-form-title">Đổi mật khẩu</h2>
          <p>Bạn sẽ cần đăng nhập lại trên thiết bị này và mọi thiết bị khác.</p>
        </div>
      </div>
      <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
        <ErrorSummary ref={summaryRef} errors={summaryErrors} />
        <Input
          id="password-currentPassword"
          label="Mật khẩu hiện tại"
          type="password"
          value={currentPassword}
          autoComplete="current-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
          error={errors.currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.currentTarget.value);
          }}
        />
        <Input
          id="password-newPassword"
          label="Mật khẩu mới"
          type="password"
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
          }}
        />
        <Input
          id="password-confirmation"
          label="Nhập lại mật khẩu mới"
          type="password"
          value={confirmation}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
          error={errors.confirmation}
          onChange={(event) => {
            setConfirmation(event.currentTarget.value);
          }}
        />
        <ul className={styles.passwordGuidance} aria-label="Điều gì xảy ra sau khi đổi mật khẩu">
          <li>Mọi access token và refresh session hiện tại sẽ không còn hiệu lực.</li>
          <li>rePhone không giữ mật khẩu trong trình duyệt.</li>
        </ul>
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
