import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock('@/app/auth-provider', () => ({
  useAuth: mockUseAuth,
}));

import { BackofficeAccessGate } from './backoffice-access-gate';

describe('BackofficeAccessGate', () => {
  let childRenderCount = 0;

  function ProtectedContent() {
    childRenderCount += 1;
    return <h1>Dữ liệu vận hành bí mật</h1>;
  }

  beforeEach(() => {
    childRenderCount = 0;
    vi.clearAllMocks();
  });

  it('shows a neutral loading screen without mounting protected children', () => {
    mockUseAuth.mockReturnValue(authState('loading'));

    const markup = renderGate(<ProtectedContent />);

    expect(markup).toContain('aria-label="Đang kiểm tra quyền truy cập"');
    expect(markup).not.toContain('data-shell="backoffice"');
    expect(markup).not.toContain('Dữ liệu vận hành bí mật');
    expect(childRenderCount).toBe(0);
  });

  it('blocks anonymous visitors and offers login without mounting protected children', () => {
    mockUseAuth.mockReturnValue(authState('anonymous'));

    const markup = renderGate(<ProtectedContent />);

    expect(markup).toContain('<h1 id="backoffice-access-title">Không có quyền truy cập</h1>');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('>Đăng nhập</a>');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('>Về cửa hàng</a>');
    expect(markup).not.toContain('Dữ liệu vận hành bí mật');
    expect(childRenderCount).toBe(0);
  });

  it('blocks customer accounts and offers account-safe destinations', () => {
    mockUseAuth.mockReturnValue(authState('authenticated', 'CUSTOMER'));

    const markup = renderGate(<ProtectedContent />);

    expect(markup).toContain('<h1 id="backoffice-access-title">Không có quyền truy cập</h1>');
    expect(markup).toContain('href="/account"');
    expect(markup).toContain('>Quản lý tài khoản</a>');
    expect(markup).toContain('>Về cửa hàng</a>');
    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain('Dữ liệu vận hành bí mật');
    expect(childRenderCount).toBe(0);
  });

  it('fails closed when an authenticated state has no user', () => {
    mockUseAuth.mockReturnValue(authState('authenticated'));

    const markup = renderGate(<ProtectedContent />);

    expect(markup).toContain('Chưa thể kiểm tra quyền truy cập');
    expect(markup).toContain('Thử lại');
    expect(markup).not.toContain('Dữ liệu vận hành bí mật');
    expect(childRenderCount).toBe(0);
  });

  it.each(['EMPLOYEE', 'ADMIN'] as const)('mounts protected children for %s accounts', (role) => {
    mockUseAuth.mockReturnValue(authState('authenticated', role));

    const markup = renderGate(<ProtectedContent />);

    expect(markup).toContain('Dữ liệu vận hành bí mật');
    expect(markup).not.toContain('Không có quyền truy cập');
    expect(childRenderCount).toBe(1);
  });
});

function renderGate(child: ReactNode): string {
  return renderToStaticMarkup(<BackofficeAccessGate>{child}</BackofficeAccessGate>);
}

function authState(
  status: 'loading' | 'authenticated' | 'anonymous',
  role?: 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN',
) {
  return {
    status,
    user:
      role === undefined
        ? null
        : {
            email: 'account@rephone.vn',
            fullName: 'Tài khoản Demo',
            id: 'user-id',
            role,
            status: 'ACTIVE',
          },
  };
}
