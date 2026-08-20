'use client';

import Link from 'next/link';
import { useAuth } from './auth-provider';

export function HomeContent() {
  const { status, user, logout } = useAuth();

  return (
    <main className="shell">
      <p className="eyebrow">rePhone P0</p>
      <h1>Tài khoản đã sẵn sàng.</h1>
      <p>
        Slice 02 cung cấp đăng ký, đăng nhập, refresh-token rotation và quản lý tài khoản an toàn.
      </p>

      {status === 'loading' ? <div className="status">Đang khôi phục phiên…</div> : null}
      {status === 'anonymous' ? (
        <nav className="actions" aria-label="Tài khoản">
          <Link className="button primary" href="/login">
            Đăng nhập
          </Link>
          <Link className="button" href="/register">
            Tạo tài khoản
          </Link>
        </nav>
      ) : null}
      {status === 'authenticated' && user !== null ? (
        <div className="account-card">
          <div>
            <strong>{user.fullName}</strong>
            <span>{user.email}</span>
          </div>
          <button className="button" type="button" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </div>
      ) : null}
    </main>
  );
}
