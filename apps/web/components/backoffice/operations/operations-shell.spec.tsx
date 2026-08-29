import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth, refresh, replace } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/backoffice/orders/order-id',
  useRouter: () => ({ refresh, replace }),
}));

vi.mock('@/app/auth-provider', () => ({
  useAuth: mockUseAuth,
}));

import { OperationsShell } from './operations-shell';

describe('FE-07 OperationsShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders grouped operations navigation for staff', () => {
    mockUseAuth.mockReturnValue(authState('EMPLOYEE'));

    const markup = renderToStaticMarkup(
      <OperationsShell>
        <h1>Chi tiết đơn hàng</h1>
      </OperationsShell>,
    );

    expect(markup).toContain('aria-label="Điều hướng backoffice"');
    expect(markup).toContain('Tài chính');
    expect(markup).toContain('Sau mua');
    expect(markup).toContain('aria-current="page" href="/backoffice/orders"');
    expect(markup).toContain('Chi tiết đơn hàng');
  });

  it('does not mount internal content for a customer account', () => {
    mockUseAuth.mockReturnValue(authState('CUSTOMER'));

    const markup = renderToStaticMarkup(
      <OperationsShell>
        <h1>Dữ liệu nội bộ</h1>
      </OperationsShell>,
    );

    expect(markup).toContain('Tài khoản hiện tại không có quyền xử lý nghiệp vụ vận hành.');
    expect(markup).not.toContain('Dữ liệu nội bộ');
  });
});

function authState(role: 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN') {
  return {
    client: {},
    logout: vi.fn(),
    logoutPending: false,
    status: 'authenticated',
    user: {
      email: 'staff@rephone.vn',
      fullName: 'Nhân viên Demo',
      id: 'user-id',
      role,
      status: 'ACTIVE',
    },
  };
}
