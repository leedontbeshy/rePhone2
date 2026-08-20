'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { useAuth } from '../auth-provider';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const phone = formString(form, 'phone').trim();
    try {
      await register({
        email: formString(form, 'email'),
        password: formString(form, 'password'),
        fullName: formString(form, 'fullName'),
        ...(phone.length === 0 ? {} : { phone }),
      });
      router.push('/login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo tài khoản.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">Tài khoản rePhone</p>
        <h1>Đăng ký</h1>
        <label>
          Họ và tên
          <input name="fullName" autoComplete="name" required maxLength={255} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required maxLength={320} />
        </label>
        <label>
          Số điện thoại (không bắt buộc)
          <input name="phone" type="tel" autoComplete="tel" maxLength={32} />
        </label>
        <label>
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            pattern="(?=.*[A-Za-z])(?=.*\\d)(?!\\s)(?!.*\\s$).{8,128}"
            title="Dài 8–128 ký tự, có ít nhất một chữ và một số, không có khoảng trắng ở đầu/cuối."
          />
        </label>
        {error === undefined ? null : <p className="form-error">{error}</p>}
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? 'Đang tạo…' : 'Tạo tài khoản'}
        </button>
        <p className="form-footer">
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </p>
      </form>
    </main>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
