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

export default function AcceptInvitationPage() {
  const { client } = useAuth();
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
      const result = await client.POST('/api/v1/auth/accept-employee-invitation', {
        body: { token, password },
      });
      if (result.response.status !== 204) {
        throw authErrorFromResponse(
          result.error,
          result.response.status,
          'Không thể kích hoạt tài khoản.',
        );
      }
      setToken(undefined);
      setCompleted(true);
    } catch (caught) {
      const actionError = toAuthActionError(caught, 'Không thể kết nối để kích hoạt tài khoản.');
      if (actionError.code === 'ONE_TIME_TOKEN_INVALID') {
        setToken(undefined);
      } else {
        showIssue(authIssueFromError(actionError, 'invitation'));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthPage
      title="Kích hoạt tài khoản nhân viên"
      description="Tạo mật khẩu để hoàn tất lời mời. Thao tác này không tự đăng nhập."
    >
      {!loaded ? <AuthPending>Đang kiểm tra lời mời…</AuthPending> : null}
      {loaded && token === undefined && !completed ? (
        <InlineAlert tone="danger" title="Lời mời không dùng được">
          Lời mời này bị thiếu thông tin, đã hết hạn hoặc đã được sử dụng. Hãy nhờ quản trị viên gửi
          lại.
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
              loadingLabel="Đang kích hoạt tài khoản"
            >
              Kích hoạt tài khoản
            </Button>
            <AuthFormFooter>
              <Link href="/login">Quay lại đăng nhập</Link>
            </AuthFormFooter>
          </AuthFormActions>
          <AuthSecurityNote>Lời mời chỉ dùng được một lần và có thời hạn.</AuthSecurityNote>
        </AuthForm>
      )}
      {completed ? (
        <div ref={successRef} className={authStyles.terminalState} tabIndex={-1}>
          <InlineAlert tone="success" title="Tài khoản đã được kích hoạt">
            Lời mời đã được sử dụng. Hãy đăng nhập riêng bằng mật khẩu vừa tạo.
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
