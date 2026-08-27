'use client';

import { useState, type SyntheticEvent } from 'react';
import { authErrorFromResponse, toAuthActionError, useAuth } from '../auth-provider';
import {
  AnonymousAuthGate,
  AuthForm,
  AuthFormActions,
  AuthFormFooter,
  AuthPage,
  AuthSecurityNote,
  authIssueFromError,
  authStyles,
  emailError,
  issueFromFields,
  useAuthFormIssue,
  type AuthFieldErrors,
} from '@/components/auth';
import { Button, ErrorSummary, InlineAlert, Input, Link } from '@/components/ui';

const description = 'Nhập email tài khoản để yêu cầu một liên kết đặt lại mật khẩu.';

export default function ForgotPasswordPage() {
  const { client } = useAuth();
  const { clearIssue, issue, showIssue, summaryRef } = useAuthFormIssue();
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    const email = formString(form, 'email').trim();
    const fields: AuthFieldErrors = {};
    const invalidEmail = emailError(email);
    if (invalidEmail !== undefined) fields.email = invalidEmail;
    if (Object.keys(fields).length > 0) {
      showIssue(issueFromFields(fields));
      return;
    }

    clearIssue();
    setSubmitting(true);
    try {
      const result = await client.POST('/api/v1/auth/forgot-password', { body: { email } });
      if (result.data === undefined) {
        throw authErrorFromResponse(result.error, result.response.status, 'Không thể gửi yêu cầu.');
      }
      setAccepted(true);
    } catch (caught) {
      showIssue(
        authIssueFromError(
          toAuthActionError(caught, 'Không thể kết nối để gửi yêu cầu.'),
          'forgot',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const content = (
    <AuthPage title="Quên mật khẩu" description={description}>
      {accepted ? (
        <div aria-live="polite">
          <InlineAlert tone="success" title="Yêu cầu đã được tiếp nhận">
            Nếu tài khoản phù hợp với email đã nhập, rePhone sẽ gửi hướng dẫn. Vì lý do riêng tư,
            chúng tôi không xác nhận tài khoản có tồn tại hay không.
          </InlineAlert>
          <AuthFormActions>
            <Link href="/login" standalone>
              Quay lại đăng nhập
            </Link>
          </AuthFormActions>
        </div>
      ) : (
        <AuthForm onSubmit={(event) => void submit(event)} aria-busy={submitting || undefined}>
          <ErrorSummary ref={summaryRef} errors={issue.errors} />
          <p className={authStyles.copy}>
            Vì lý do riêng tư, rePhone không xác nhận một email có tồn tại hay không.
          </p>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            label="Email"
            required
            maxLength={320}
            error={issue.fields.email}
          />
          <AuthFormActions>
            <Button
              className={authStyles.primaryAction}
              type="submit"
              loading={submitting}
              loadingLabel="Đang gửi yêu cầu"
            >
              Gửi liên kết
            </Button>
            <AuthFormFooter>
              <Link href="/login">Quay lại đăng nhập</Link>
            </AuthFormFooter>
          </AuthFormActions>
          <AuthSecurityNote>
            Liên kết đặt lại chỉ dùng được một lần và có thời hạn.
          </AuthSecurityNote>
        </AuthForm>
      )}
    </AuthPage>
  );

  return (
    <AnonymousAuthGate title="Quên mật khẩu" description={description}>
      {content}
    </AnonymousAuthGate>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
