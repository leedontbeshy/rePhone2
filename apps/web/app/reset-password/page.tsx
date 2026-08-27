'use client';

import { useState, type SyntheticEvent } from 'react';
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

export default function ResetPasswordPage() {
  const { client } = useAuth();
  const { loaded, setToken, token } = useFragmentAuthToken();
  const { clearIssue, issue, showIssue, summaryRef } = useAuthFormIssue();
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (submitting || token === undefined) return;
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
      setCompleted(true);
    } catch (caught) {
      showIssue(
        authIssueFromError(
          toAuthActionError(caught, 'Không thể kết nối để đặt lại mật khẩu.'),
          'reset',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPage
      title="Đặt mật khẩu mới"
      description="Liên kết được lấy khỏi fragment và xóa khỏi thanh địa chỉ trước khi sử dụng."
    >
      {!loaded ? <AuthPending>Đang kiểm tra liên kết…</AuthPending> : null}
      {loaded && token === undefined && !completed ? (
        <InlineAlert tone="danger" title="Liên kết không dùng được">
          Liên kết thiếu token, không hợp lệ hoặc đã được mở trước đó.{' '}
          <Link href="/forgot-password">Yêu cầu liên kết mới</Link>.
        </InlineAlert>
      ) : null}
      {token === undefined || completed ? null : (
        <AuthForm onSubmit={(event) => void submit(event)} aria-busy={submitting || undefined}>
          <ErrorSummary ref={summaryRef} errors={issue.errors} />
          <PasswordFields errors={issue.fields} />
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
            Đổi mật khẩu thành công sẽ thu hồi toàn bộ phiên đăng nhập cũ.
          </AuthSecurityNote>
        </AuthForm>
      )}
      {completed ? (
        <div aria-live="polite">
          <InlineAlert tone="success" title="Mật khẩu đã được cập nhật">
            Các phiên cũ đã bị thu hồi. Hãy đăng nhập lại bằng mật khẩu mới.
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
