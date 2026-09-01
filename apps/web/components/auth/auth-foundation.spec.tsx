import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorSummary } from '@/components/ui';
import { AuthActionError } from '@/app/auth-provider';
import {
  AuthForm,
  AuthPage,
  PasswordFields,
  authDestination,
  authIssueFromError,
  confirmationError,
  passwordPolicyError,
  safeAuthReturnTo,
  withoutAuthFieldIssue,
} from './index';

describe('auth UI foundation', () => {
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
