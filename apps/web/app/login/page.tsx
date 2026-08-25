'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { useAuth } from '../auth-provider';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      await login({
        email: formString(form, 'email'),
        password: formString(form, 'password'),
      });
      router.push('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">Tài khoản rePhone</p>
        <h1>Đăng nhập</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required maxLength={320} />
        </label>
        <label>
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={128}
          />
        </label>
        {error === undefined ? null : <p className="form-error">{error}</p>}
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="form-footer">
          Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
        </p>
        <p className="form-footer">
          <Link href="/forgot-password">Quên mật khẩu?</Link>
        </p>
      </form>
    </main>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
