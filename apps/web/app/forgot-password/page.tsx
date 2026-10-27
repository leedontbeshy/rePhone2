'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
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
import { demoMode } from '@/lib/demo';

const description = 'Nhập email tài khoản để yêu cầu một liên kết đặt lại mật khẩu.';

export default function ForgotPasswordPage() {
  const { client } = useAuth();
  const { clearFieldIssue, clearIssue, issue, showIssue, summaryRef } = useAuthFormIssue();
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const submittingRef = useRef(false);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (accepted) window.requestAnimationFrame(() => successRef.current?.focus());
  }, [accepted]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (submittingRef.current) return;
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
    submittingRef.current = true;
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const content = (
    <AuthPage title="Quên mật khẩu" description={description}>
      {accepted ? (
        <div ref={successRef} className={authStyles.terminalState} tabIndex={-1}>
          <InlineAlert tone="success" title="Yêu cầu đã được tiếp nhận">
            Nếu thông tin phù hợp, hướng dẫn sẽ được gửi tới email đã nhập.
          </InlineAlert>
          <AuthFormActions>
            <Link href="/login" standalone>
              Quay lại đăng nhập
            </Link>
          </AuthFormActions>
        </div>
      ) : demoMode ? (
        <InlineAlert tone="info" title="Email đang tắt trong bản demo">
          Luồng đặt lại mật khẩu không khả dụng. Vui lòng dùng tài khoản demo đã được cung cấp.
        </InlineAlert>
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
            disabled={submitting}
            label="Email"
            required
            maxLength={320}
            error={issue.fields.email}
            onChange={() => {
              clearFieldIssue('email');
            }}
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
