'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { authErrorFromResponse, toAuthActionError, useAuth } from '../auth-provider';
import {
  AuthForm,
  AuthFormActions,
  AuthFormFooter,
  AuthPage,
  AuthPending,
  AuthSecurityNote,
  PasswordFields,
  authIssueFromError,
  authStyles,
  confirmationError,
  issueFromFields,
  passwordPolicyError,
  useAuthFormIssue,
  useFragmentAuthToken,
  type AuthFieldErrors,
} from '@/components/auth';
import { Button, ErrorSummary, InlineAlert, Link } from '@/components/ui';
import { demoMode } from '@/lib/demo';

export default function ResetPasswordPage() {
  const { client, logout } = useAuth();
  const { loaded, setToken, token } = useFragmentAuthToken();
  const { clearFieldIssue, clearIssue, issue, showIssue, summaryRef } = useAuthFormIssue();
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const submittingRef = useRef(false);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (completed) window.requestAnimationFrame(() => successRef.current?.focus());
  }, [completed]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (submittingRef.current || token === undefined) return;
    const form = new FormData(event.currentTarget);
    const password = formString(form, 'password');
    const confirmation = formString(form, 'confirmation');
    const fields: AuthFieldErrors = {};
    const invalidPassword = passwordPolicyError(password);
    const invalidConfirmation = confirmationError(password, confirmation);
    if (invalidPassword !== undefined) fields.password = invalidPassword;
    if (invalidConfirmation !== undefined) fields.confirmation = invalidConfirmation;
    if (Object.keys(fields).length > 0) {
      showIssue(issueFromFields(fields));
      return;
    }

    clearIssue();
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await client.POST('/api/v1/auth/reset-password', {
        body: { token, newPassword: password },
      });
      if (result.response.status !== 204) {
        throw authErrorFromResponse(
          result.error,
          result.response.status,
          'Không thể đặt lại mật khẩu.',
        );
      }
      setToken(undefined);
      try {
        await logout();
      } catch {
        // Resetting the password already revokes every session server-side. The provider
        // clears its in-memory token before attempting to clear the refresh cookie.
      }
      setCompleted(true);
    } catch (caught) {
      const actionError = toAuthActionError(caught, 'Không thể kết nối để đặt lại mật khẩu.');
      if (actionError.code === 'ONE_TIME_TOKEN_INVALID') {
        setToken(undefined);
      } else {
        showIssue(authIssueFromError(actionError, 'reset'));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (demoMode)
    return (
      <AuthPage title="Đặt mật khẩu mới" description="Email đang tắt trong bản demo.">
        <Link href="/login">Quay lại đăng nhập</Link>
      </AuthPage>
    );

  return (
    <AuthPage
      title="Đặt mật khẩu mới"
      description="Hãy tạo mật khẩu mới để tiếp tục sử dụng tài khoản."
    >
      {!loaded ? <AuthPending>Đang kiểm tra liên kết…</AuthPending> : null}
      {loaded && submitting && token === undefined && !completed ? (
        <AuthPending>Đang hoàn tất đổi mật khẩu…</AuthPending>
      ) : null}
      {loaded && token === undefined && !completed && !submitting ? (
        <InlineAlert tone="danger" title="Liên kết không dùng được">
          Liên kết này bị thiếu thông tin, đã hết hạn hoặc đã được sử dụng.{' '}
          <Link href="/forgot-password">Yêu cầu liên kết mới</Link>.
        </InlineAlert>
      ) : null}
      {token === undefined || completed ? null : (
        <AuthForm onSubmit={(event) => void submit(event)} aria-busy={submitting || undefined}>
          <ErrorSummary ref={summaryRef} errors={issue.errors} />
          <PasswordFields
            disabled={submitting}
            errors={issue.fields}
            onFieldChange={clearFieldIssue}
          />
          <AuthFormActions>
            <Button
              className={authStyles.primaryAction}
              type="submit"
              loading={submitting}
              loadingLabel="Đang cập nhật mật khẩu"
            >
              Đổi mật khẩu
            </Button>
            <AuthFormFooter>
              <Link href="/login">Quay lại đăng nhập</Link>
            </AuthFormFooter>
          </AuthFormActions>
          <AuthSecurityNote>
            Sau khi đổi mật khẩu, bạn sẽ cần đăng nhập lại trên tất cả thiết bị.
          </AuthSecurityNote>
        </AuthForm>
      )}
      {completed ? (
        <div ref={successRef} className={authStyles.terminalState} tabIndex={-1}>
          <InlineAlert tone="success" title="Mật khẩu đã được cập nhật">
            Mọi thiết bị đã được đăng xuất. Hãy đăng nhập lại bằng mật khẩu mới.
          </InlineAlert>
          <AuthFormActions>
            <Link href="/login" standalone>
              Đi đến đăng nhập
            </Link>
          </AuthFormActions>
        </div>
      ) : null}
    </AuthPage>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
