'use client';

import Link from 'next/link';
import { useRef, useState, type SyntheticEvent } from 'react';
import { apiError } from '../../lib/order-access';
import { useAuth } from '../auth-provider';

export default function ForgotPasswordPage() {
  const { client } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await client.POST('/api/v1/auth/forgot-password', {
        body: { email: typeof email === 'string' ? email.trim() : '' },
      });
      if (result.data === undefined) {
        throw new Error(apiError(result.error, 'Không thể gửi yêu cầu đặt lại mật khẩu.'));
      }
      setAccepted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi yêu cầu.');
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">Khôi phục tài khoản</p>
        <h1>Quên mật khẩu</h1>
        {accepted ? (
          <p className="status" role="status" aria-live="polite">
            Nếu email tồn tại, rePhone đã gửi liên kết đặt lại mật khẩu.
          </p>
        ) : (
          <>
            <p>Nhập email tài khoản. Phản hồi luôn giống nhau để bảo vệ thông tin người dùng.</p>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required maxLength={320} />
            </label>
            <button className="button primary" type="submit" disabled={submitting}>
              {submitting ? 'Đang gửi…' : 'Gửi liên kết'}
            </button>
          </>
        )}
        {error === undefined ? null : (
          <p ref={alertRef} tabIndex={-1} className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="form-footer">
          <Link href="/login">Quay lại đăng nhập</Link>
        </p>
      </form>
    </main>
  );
}
