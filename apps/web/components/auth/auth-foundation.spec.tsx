import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSummary } from '@/components/ui';
import { AuthActionError } from '@/app/auth-provider';
import {
  AuthForm,
  AuthPending,
  AuthPage,
  PasswordFields,
  authDestination,
  authIssueFromError,
  confirmationError,
  passwordPolicyError,
  safeAuthReturnTo,
  withoutAuthFieldIssue,
} from './index';

const navigation = vi.hoisted(() => ({ pathname: '/login' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

describe('auth UI foundation', () => {
  beforeEach(() => {
    navigation.pathname = '/login';
  });

  it('renders the quiet auth shell with labelled password controls and an error live region', () => {
    const html = renderToStaticMarkup(
      <AuthPage title="Đặt mật khẩu" description="Mô tả an toàn">
        <AuthForm>
          <ErrorSummary errors={[{ href: '#password', message: 'Kiểm tra mật khẩu' }]} />
          <PasswordFields errors={{ password: 'Kiểm tra mật khẩu' }} />
        </AuthForm>
      </AuthPage>,
    );

    expect(html).toContain('data-shell="auth"');
    expect(html).toContain('<h1');
    expect(html).toContain('id="password"');
    expect(html).toContain('id="confirmation"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-label="Hiện mật khẩu"');
    expect(html).toContain('aria-controls="password"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('noValidate=""');
    expect(html).toContain('href="/"');
    expect(html).toContain('Về trang chủ');
    expect(html).toContain('alt=""');
    expect(html).toContain('auth-studio.webp');
    expect(html.match(/<main\b/g)).toHaveLength(1);
  });

  it('uses route links with a current page for login and register, without showing both forms', () => {
    for (const pathname of ['/login', '/register']) {
      navigation.pathname = pathname;
      const html = renderToStaticMarkup(
        <AuthPage title="Tài khoản">
          <AuthForm>
            <input name="email" />
          </AuthForm>
        </AuthPage>,
      );
      expect(html).toContain('aria-label="Đăng nhập hoặc tạo tài khoản"');
      expect(html).toMatch(
        new RegExp(
          '<a[^>]*(?:aria-current="page"[^>]*href="' +
            pathname +
            '"|href="' +
            pathname +
            '"[^>]*aria-current="page")',
        ),
      );
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html.match(/<form\b/g)).toHaveLength(1);
      expect(html).not.toContain('role="tab"');
    }
  });

  it('keeps recovery and invitation screens free of an active login/register destination', () => {
    for (const pathname of ['/forgot-password', '/reset-password', '/accept-invitation']) {
      navigation.pathname = pathname;
      const html = renderToStaticMarkup(
        <AuthPage title="Khôi phục tài khoản">
          <AuthPending>Đang chuẩn bị…</AuthPending>
        </AuthPage>,
      );
      expect(html).not.toContain('aria-label="Đăng nhập hoặc tạo tài khoản"');
      expect(html).not.toContain('aria-current="page"');
      expect(html).not.toContain('<input');
    }
  });

  it('keeps the pending auth form stable without exposing placeholder content', () => {
    const html = renderToStaticMarkup(<AuthPending>Đang chuẩn bị biểu mẫu…</AuthPending>);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Đang chuẩn bị biểu mẫu…');
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
  });

  it('clears only the edited field issue while preserving unrelated and global errors', () => {
    expect(
      withoutAuthFieldIssue(
        {
          errors: [
            { href: '#email', message: 'Email chưa đúng' },
            { href: '#password', message: 'Mật khẩu chưa đúng' },
            { message: 'Lỗi chung' },
          ],
          fields: { email: 'Email chưa đúng', password: 'Mật khẩu chưa đúng' },
        },
        'email',
      ),
    ).toEqual({
      errors: [{ href: '#password', message: 'Mật khẩu chưa đúng' }, { message: 'Lỗi chung' }],
      fields: { password: 'Mật khẩu chưa đúng' },
    });
  });

  it('enforces the accepted password policy and confirmation', () => {
    expect(passwordPolicyError('abcdefgh')).toBeDefined();
    expect(passwordPolicyError('12345678')).toBeDefined();
    expect(passwordPolicyError(' Password1')).toBeDefined();
    expect(passwordPolicyError('Password1 ')).toBeDefined();
    expect(passwordPolicyError('Password1')).toBeUndefined();
    expect(confirmationError('Password1', 'Password2')).toBe('Mật khẩu xác nhận chưa khớp.');
  });

  it('maps auth failures by stable code without collapsing distinct outcomes', () => {
    expect(authIssueFromError(new AuthActionError('INVALID_CREDENTIALS', 'raw'), 'login')).toEqual({
      errors: [{ message: 'Email hoặc mật khẩu không đúng.' }],
      fields: {},
    });
    expect(
      authIssueFromError(new AuthActionError('ACCOUNT_UNAVAILABLE', 'raw'), 'login').errors[0]
        ?.message,
    ).toContain('tạm khóa');
    const duplicateRegistration = authIssueFromError(
      new AuthActionError('DUPLICATE_RESOURCE', 'raw'),
      'register',
    );
    expect(duplicateRegistration.fields).toEqual({});
    expect(duplicateRegistration.errors[0]?.message).not.toContain('đã được dùng');
    expect(
      authIssueFromError(new AuthActionError('RATE_LIMITED', 'raw'), 'forgot').errors[0]?.message,
    ).toContain('quá nhiều');
  });

  it('allows only role-appropriate same-origin return paths', () => {
    expect(safeAuthReturnTo('/account/addresses?edit=1', 'CUSTOMER')).toBe(
      '/account/addresses?edit=1',
    );
    expect(safeAuthReturnTo('/cart', 'CUSTOMER')).toBe('/cart');
    expect(safeAuthReturnTo('/affiliate', 'CUSTOMER')).toBe('/affiliate');
    expect(safeAuthReturnTo('/backoffice/orders?page=2', 'EMPLOYEE')).toBe(
      '/backoffice/orders?page=2',
    );
    expect(safeAuthReturnTo('/backoffice/orders', 'CUSTOMER')).toBeNull();
    expect(safeAuthReturnTo('https://evil.example/account', 'CUSTOMER')).toBeNull();
    expect(safeAuthReturnTo('//evil.example/account', 'CUSTOMER')).toBeNull();
    expect(safeAuthReturnTo('/account#token=secret', 'CUSTOMER')).toBeNull();
    expect(authDestination('CUSTOMER', 'https://evil.example')).toBe('/account');
    expect(authDestination('EMPLOYEE')).toBe('/backoffice');
    expect(authDestination('ADMIN', '/account')).toBe('/backoffice');
    expect(authDestination('ADMIN', '/backoffice/orders?status=PLACED')).toBe(
      '/backoffice/orders?status=PLACED',
    );
  });
});
