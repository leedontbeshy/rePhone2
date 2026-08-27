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
    expect(html).toContain('role="alert"');
    expect(html).toContain('noValidate=""');
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
    expect(
      authIssueFromError(new AuthActionError('DUPLICATE_RESOURCE', 'raw'), 'register').fields.email,
    ).toContain('đã được dùng');
    expect(
      authIssueFromError(new AuthActionError('RATE_LIMITED', 'raw'), 'forgot').errors[0]?.message,
    ).toContain('quá nhiều');
  });

  it('allows only role-appropriate same-origin return paths', () => {
    expect(safeAuthReturnTo('/account/addresses?edit=1', 'CUSTOMER')).toBe(
      '/account/addresses?edit=1',
    );
    expect(safeAuthReturnTo('/backoffice/orders?page=2', 'EMPLOYEE')).toBe(
      '/backoffice/orders?page=2',
    );
    expect(safeAuthReturnTo('/backoffice/orders', 'CUSTOMER')).toBeNull();
    expect(safeAuthReturnTo('https://evil.example/account', 'CUSTOMER')).toBeNull();
    expect(safeAuthReturnTo('//evil.example/account', 'CUSTOMER')).toBeNull();
    expect(safeAuthReturnTo('/account#token=secret', 'CUSTOMER')).toBeNull();
    expect(authDestination('CUSTOMER', 'https://evil.example')).toBe('/account');
    expect(authDestination('ADMIN', '/account')).toBe('/backoffice/orders');
  });
});
