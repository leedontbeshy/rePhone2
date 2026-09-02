'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
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
    if (submittingRef.current) return;

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
    submittingRef.current = true;
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const content = (
    <AuthPage title="Tạo tài khoản" description={description}>
      {completed ? (
        <div ref={successRef} className={authStyles.terminalState} tabIndex={-1}>
          <InlineAlert tone="success" title="Tài khoản đã được tạo">
            Tài khoản đã được tạo nhưng bạn chưa đăng nhập. Hãy đăng nhập để tiếp tục.
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
            disabled={submitting}
            label="Họ và tên"
            required
            maxLength={255}
            error={issue.fields.fullName}
            onChange={() => {
              clearFieldIssue('fullName');
            }}
          />
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
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            disabled={submitting}
            label="Số điện thoại (không bắt buộc)"
            maxLength={32}
            error={issue.fields.phone}
            onChange={() => {
              clearFieldIssue('phone');
            }}
          />
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
              loadingLabel="Đang tạo tài khoản"
            >
              Tạo tài khoản
            </Button>
            <AuthFormFooter>
              Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
            </AuthFormFooter>
          </AuthFormActions>
          <AuthSecurityNote>
            Dùng mật khẩu riêng cho rePhone và không chia sẻ với người khác.
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
