import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth, refresh, replace, routeState } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  routeState: { pathname: '/backoffice/employees' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => routeState.pathname,
  useRouter: () => ({ refresh, replace }),
}));

vi.mock('@/app/auth-provider', () => ({
  useAuth: mockUseAuth,
}));

import { SystemAdminShell } from './system-admin-shell';

describe('FE-08 SystemAdminShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.pathname = '/backoffice/employees';
  });

  it('renders the shared shell, actor and current system destination for administrators', () => {
    mockUseAuth.mockReturnValue(authState('ADMIN'));

    const markup = renderToStaticMarkup(
      <SystemAdminShell breadcrumbs={[{ label: 'Hệ thống' }, { label: 'Nhân viên' }]}>
        <h1>Quản lý nhân viên</h1>
      </SystemAdminShell>,
    );

    expect(markup).toContain('data-shell="backoffice"');
    expect(markup).toContain('aria-label="Điều hướng backoffice"');
    expect(markup).toContain('aria-current="page" href="/backoffice/employees"');
    expect(markup).toContain('aria-label="Đường dẫn"');
    expect(markup).toContain('Quản trị viên Demo');
    expect(markup).toContain('Quản lý nhân viên');
  });

  it('mounts the customer workspace for employees while keeping admin navigation disabled', () => {
    routeState.pathname = '/backoffice/customers';
    mockUseAuth.mockReturnValue(authState('EMPLOYEE'));

    const markup = renderToStaticMarkup(
      <SystemAdminShell>
        <h1>Khách hàng an toàn</h1>
      </SystemAdminShell>,
    );

    expect(markup).toContain('aria-current="page" href="/backoffice/customers"');
    expect(markup).toContain('Khách hàng an toàn');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain('href="/backoffice/employees"');
  });

  it('fails closed before mounting admin-only content for an employee', () => {
    mockUseAuth.mockReturnValue(authState('EMPLOYEE'));

    const markup = renderToStaticMarkup(
      <SystemAdminShell>
        <h1>Dữ liệu nhân viên bí mật</h1>
      </SystemAdminShell>,
    );

    expect(markup).toContain('Chỉ quản trị viên được mở khu vực này.');
    expect(markup).not.toContain('Dữ liệu nhân viên bí mật');
  });

  it('fails closed on an unknown system route even for administrators', () => {
    routeState.pathname = '/backoffice/system/unknown';
    mockUseAuth.mockReturnValue(authState('ADMIN'));

    const markup = renderToStaticMarkup(
      <SystemAdminShell>
        <h1>Nội dung ngoài allowlist</h1>
      </SystemAdminShell>,
    );

    expect(markup).toContain('Tài khoản hiện tại không có quyền mở đường dẫn quản trị này.');
    expect(markup).not.toContain('Nội dung ngoài allowlist');
  });

  it('leaves active-item positioning to BackofficeShell without scrolling the document', () => {
    const shellPath = fileURLToPath(new URL('./system-admin-shell.tsx', import.meta.url));
    const source = readFileSync(shellPath, 'utf8');

    expect(source).not.toContain('scrollIntoView');
    expect(source).toContain("navigation.dataset.systemNavigation = 'true'");
    expect(source).toContain('systemNavigationOverflowState(navigation)');
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
      fullName: role === 'ADMIN' ? 'Quản trị viên Demo' : 'Nhân viên Demo',
      id: 'user-id',
      role,
      status: 'ACTIVE',
    },
  };
}
