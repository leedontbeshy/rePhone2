'use client';

import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { useAuth } from '../auth-provider';
import {
  AnonymousAuthGate,
  AuthForm,
  AuthFormActions,
  AuthFormFooter,
  AuthPage,
  AuthSecurityNote,
  authDestination,
  authIssueFromError,
  authStyles,
  emailError,
  issueFromFields,
  loginPasswordError,
  useAuthFormIssue,
  type AuthFieldErrors,
} from '@/components/auth';
import { Button, ErrorSummary, Input, Link } from '@/components/ui';

const description = 'Tiếp tục vào tài khoản mua hàng hoặc không gian vận hành của bạn.';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { clearIssue, issue, showIssue, summaryRef } = useAuthFormIssue();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (submitting) return;

    const form = new FormData(event.currentTarget);
    const email = formString(form, 'email').trim();
    const password = formString(form, 'password');
    const fields: AuthFieldErrors = {};
    const invalidEmail = emailError(email);
    const invalidPassword = loginPasswordError(password);
    if (invalidEmail !== undefined) fields.email = invalidEmail;
    if (invalidPassword !== undefined) fields.password = invalidPassword;
    if (Object.keys(fields).length > 0) {
      showIssue(issueFromFields(fields));
      return;
    }

    clearIssue();
    setSubmitting(true);
    try {
      const user = await login({ email, password });
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      router.replace(authDestination(user.role, returnTo));
    } catch (caught) {
      showIssue(authIssueFromError(caught, 'login'));
    } finally {
      setSubmitting(false);
    }
  }

  const content = (
    <AuthPage title="Đăng nhập" description={description}>
      <AuthForm onSubmit={(event) => void submit(event)} aria-busy={submitting || undefined}>
        <ErrorSummary ref={summaryRef} errors={issue.errors} />
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
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          label="Mật khẩu"
          required
          minLength={8}
          maxLength={128}
          error={issue.fields.password}
        />
        <AuthFormActions>
          <Button
            className={authStyles.primaryAction}
            type="submit"
            loading={submitting}
            loadingLabel="Đang đăng nhập"
          >
            Đăng nhập
          </Button>
          <AuthFormFooter>
            <Link href="/forgot-password">Quên mật khẩu?</Link>
          </AuthFormFooter>
          <AuthFormFooter>
            Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
          </AuthFormFooter>
        </AuthFormActions>
        <AuthSecurityNote>
          Phiên đăng nhập dùng cookie bảo mật; access token không được lưu vào localStorage.
        </AuthSecurityNote>
      </AuthForm>
    </AuthPage>
  );

  return (
    <AnonymousAuthGate title="Đăng nhập" description={description}>
      {content}
    </AnonymousAuthGate>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
