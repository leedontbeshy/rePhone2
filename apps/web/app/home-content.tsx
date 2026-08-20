'use client';

import Link from 'next/link';
import { useAuth } from './auth-provider';

export function HomeContent() {
  const { status, user, logout } = useAuth();

  return (
    <main className="shell">
      <p className="eyebrow">rePhone P0</p>
      <h1>iPhone cũ, thông tin thật.</h1>
      <p>Duyệt từng máy đang bán với ảnh, giá, pin, ngoại hình, kiểm định và bảo hành rõ ràng.</p>

      <nav className="actions home-catalog-action" aria-label="Catalog">
        <Link className="button primary" href="/products">
          Xem catalog
        </Link>
      </nav>

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
