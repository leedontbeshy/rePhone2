import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth, replace, refresh } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/backoffice/inventory/units',
  useRouter: () => ({ refresh, replace }),
}));

vi.mock('@/app/auth-provider', () => ({
  useAuth: mockUseAuth,
}));

import { InventoryShell } from './inventory-shell';

describe('FE-06 InventoryShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the inventory workspace for employees without mounting admin-only content', () => {
    mockUseAuth.mockReturnValue(authState('EMPLOYEE'));

    const markup = renderToStaticMarkup(
      <InventoryShell adminContent={<section>Giá vốn bí mật</section>}>
        <h1>Danh sách máy</h1>
      </InventoryShell>,
    );

    expect(markup).toContain('aria-label="Điều hướng backoffice"');
    expect(markup).toContain('Kho hàng');
    expect(markup).toContain('Máy vật lý');
    expect(markup).not.toContain('>Kho hàng</span>');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Danh sách máy');
    expect(markup).not.toContain('Giá vốn bí mật');
  });

  it('mounts the cost compartment for administrators', () => {
    mockUseAuth.mockReturnValue(authState('ADMIN'));

    const markup = renderToStaticMarkup(
      <InventoryShell adminContent={<section>Giá vốn bí mật</section>}>
        <h1>Hồ sơ máy</h1>
      </InventoryShell>,
    );

    expect(markup).toContain('Hồ sơ máy');
    expect(markup).toContain('Giá vốn bí mật');
  });

  it('keeps intake navigation active while the workflow opens an inspection page', () => {
    mockUseAuth.mockReturnValue(authState('ADMIN'));

    const markup = renderToStaticMarkup(
      <InventoryShell activeNavigationPath="/backoffice/inventory/intake">
        <h1>Phiếu kiểm định</h1>
      </InventoryShell>,
    );

    expect(markup).toContain('aria-current="page" href="/backoffice/inventory/intake"');
  });

  it('can keep an active workflow link attached to its exact resume URL', () => {
    mockUseAuth.mockReturnValue(authState('ADMIN'));

    const resumeHref = '/backoffice/inventory/intake?unitId=unit-id&amp;inspectionId=inspection-id';
    const markup = renderToStaticMarkup(
      <InventoryShell
        activeNavigationPath="/backoffice/inventory/intake"
        navigationHrefOverrides={{
          '/backoffice/inventory/intake':
            '/backoffice/inventory/intake?unitId=unit-id&inspectionId=inspection-id',
        }}
      >
        <h1>Phiếu kiểm định</h1>
      </InventoryShell>,
    );

    expect(markup).toContain(`aria-current="page" href="${resumeHref}"`);
  });

  it('does not mount workspace content for customer accounts', () => {
    mockUseAuth.mockReturnValue(authState('CUSTOMER'));

    const markup = renderToStaticMarkup(
      <InventoryShell>
        <h1>Dữ liệu nội bộ</h1>
      </InventoryShell>,
    );

    expect(markup).toContain('Tài khoản hiện tại không có quyền quản lý kho hàng.');
    expect(markup).not.toContain('Các mục quản lý kho');
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
