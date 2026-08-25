'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { apiError } from '../../lib/order-access';
import { consumeFragmentToken } from '../../lib/one-time-auth';
import { useAuth } from '../auth-provider';

export default function ResetPasswordPage() {
  const { client } = useAuth();
  const [token, setToken] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string>();
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const captured = consumeFragmentToken(window.location.hash, () => {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    });
    setToken(captured);
    setLoaded(true);
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || token === undefined) return;
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const confirmation = form.get('confirmation');
    if (password !== confirmation) {
      showError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await client.POST('/api/v1/auth/reset-password', {
        body: { token, newPassword: typeof password === 'string' ? password : '' },
      });
      if (result.response.status !== 204) {
        throw new Error(apiError(result.error, 'Liên kết không hợp lệ hoặc đã hết hạn.'));
      }
      setToken(undefined);
      setCompleted(true);
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : 'Không thể đặt lại mật khẩu.');
    } finally {
      setSubmitting(false);
    }
  }

  function showError(message: string) {
    setError(message);
    window.requestAnimationFrame(() => alertRef.current?.focus());
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">Khôi phục tài khoản</p>
        <h1>Đặt mật khẩu mới</h1>
        {!loaded ? <p className="status">Đang kiểm tra liên kết…</p> : null}
        {loaded && token === undefined && !completed ? (
          <p className="form-error" role="alert">
            Liên kết không hợp lệ hoặc thiếu token. Hãy yêu cầu một liên kết mới.
          </p>
        ) : null}
        {token === undefined || completed ? null : (
          <>
            <PasswordFields />
            <button className="button primary" type="submit" disabled={submitting}>
              {submitting ? 'Đang cập nhật…' : 'Đổi mật khẩu'}
            </button>
          </>
        )}
        {completed ? (
          <p className="status" role="status" aria-live="polite">
            Mật khẩu đã được cập nhật. Các phiên cũ đã bị thu hồi.
          </p>
        ) : null}
        {error === undefined ? null : (
          <p ref={alertRef} tabIndex={-1} className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="form-footer">
          <Link href="/login">Đi đến đăng nhập</Link>
        </p>
      </form>
    </main>
  );
}

function PasswordFields() {
  return (
    <>
      <label>
        Mật khẩu mới
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
      </label>
      <label>
        Xác nhận mật khẩu
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
      </label>
    </>
  );
}
