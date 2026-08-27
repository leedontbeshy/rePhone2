'use client';

import { useState, type SyntheticEvent } from 'react';
import { useAuth } from '../auth-provider';
import {
  AnonymousAuthGate,
  AuthForm,
  AuthFormActions,
  AuthFormFooter,
  AuthPage,
  AuthSecurityNote,
  PasswordFields,
  authIssueFromError,
  authStyles,
  confirmationError,
  emailError,
  issueFromFields,
  passwordPolicyError,
  registrationProfileErrors,
  useAuthFormIssue,
  type AuthFieldErrors,
} from '@/components/auth';
import { Button, ErrorSummary, InlineAlert, Input, Link } from '@/components/ui';

const description = 'Tạo tài khoản khách hàng để lưu đơn hàng, bảo hành và địa chỉ nhận máy.';

export default function RegisterPage() {
  const { register } = useAuth();
  const { clearIssue, issue, showIssue, summaryRef } = useAuthFormIssue();
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (submitting) return;

    const form = new FormData(event.currentTarget);
    const email = formString(form, 'email').trim();
    const fullName = formString(form, 'fullName').trim();
    const phone = formString(form, 'phone').trim();
    const password = formString(form, 'password');
    const confirmation = formString(form, 'confirmation');
    const fields: AuthFieldErrors = { ...registrationProfileErrors(fullName, phone) };
    const invalidEmail = emailError(email);
    const invalidPassword = passwordPolicyError(password);
    const invalidConfirmation = confirmationError(password, confirmation);
    if (invalidEmail !== undefined) fields.email = invalidEmail;
    if (invalidPassword !== undefined) fields.password = invalidPassword;
    if (invalidConfirmation !== undefined) fields.confirmation = invalidConfirmation;
    if (Object.keys(fields).length > 0) {
      showIssue(issueFromFields(fields));
      return;
    }

    clearIssue();
    setSubmitting(true);
    try {
      await register({
        email,
        fullName,
        password,
        ...(phone.length === 0 ? {} : { phone }),
      });
      setCompleted(true);
    } catch (caught) {
      showIssue(authIssueFromError(caught, 'register'));
    } finally {
      setSubmitting(false);
    }
  }

  const content = (
    <AuthPage title="Tạo tài khoản" description={description}>
      {completed ? (
        <div aria-live="polite">
          <InlineAlert tone="success" title="Tài khoản đã được tạo">
            Đăng ký không tự đăng nhập. Hãy đăng nhập riêng để bắt đầu một phiên bảo mật mới.
          </InlineAlert>
          <AuthFormActions>
            <Link href="/login" standalone>
              Đi đến đăng nhập
            </Link>
          </AuthFormActions>
        </div>
      ) : (
        <AuthForm onSubmit={(event) => void submit(event)} aria-busy={submitting || undefined}>
          <ErrorSummary ref={summaryRef} errors={issue.errors} />
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            autoFocus
            label="Họ và tên"
            required
            maxLength={255}
            error={issue.fields.fullName}
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            label="Email"
            required
            maxLength={320}
            error={issue.fields.email}
          />
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            label="Số điện thoại (không bắt buộc)"
            maxLength={32}
            error={issue.fields.phone}
          />
          <PasswordFields errors={issue.fields} />
          <AuthFormActions>
            <Button
              className={authStyles.primaryAction}
              type="submit"
              loading={submitting}
              loadingLabel="Đang tạo tài khoản"
            >
              Tạo tài khoản
            </Button>
            <AuthFormFooter>
              Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
            </AuthFormFooter>
          </AuthFormActions>
          <AuthSecurityNote>
            Mật khẩu chỉ được gửi khi bạn xác nhận biểu mẫu và không được hiển thị lại.
          </AuthSecurityNote>
        </AuthForm>
      )}
    </AuthPage>
  );

  return (
    <AnonymousAuthGate title="Tạo tài khoản" description={description}>
      {content}
    </AnonymousAuthGate>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
