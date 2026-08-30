import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Customer, Employee } from '@/lib/system-admin-api';
import { CustomerDetailPanel } from './customer-admin-view';
import { EmployeeDetailPanel } from './employee-admin-view';

describe('user admin master-detail components', () => {
  it('renders pending employee actions without inventing an invitation timestamp', () => {
    const markup = renderToStaticMarkup(
      <EmployeeDetailPanel
        busy={false}
        employee={sampleEmployee({ status: 'PENDING_VERIFICATION' })}
        onDisable={vi.fn()}
        onEdit={vi.fn()}
        onEnable={vi.fn()}
        onResend={vi.fn()}
      />,
    );

    expect(markup).toContain('Chờ kích hoạt');
    expect(markup).toContain('Tóm tắt hồ sơ');
    expect(markup).toContain('Liên hệ');
    expect(markup).toContain('Tài khoản');
    expect(markup).toContain('Chưa kích hoạt tài khoản');
    expect(markup).toContain('Gửi lại lời mời');
    expect(markup).not.toContain('Gửi lúc');
  });

  it('renders restore instead of invitation and disable actions for a disabled employee', () => {
    const markup = renderToStaticMarkup(
      <EmployeeDetailPanel
        busy={false}
        employee={sampleEmployee({
          disabledAt: '2026-08-30T02:00:00.000Z',
          status: 'DISABLED',
        })}
        onDisable={vi.fn()}
        onEdit={vi.fn()}
        onEnable={vi.fn()}
        onResend={vi.fn()}
      />,
    );

    expect(markup).toContain('Kích hoạt lại');
    expect(markup).toContain('Vô hiệu hóa lúc');
    expect(markup).not.toContain('Gửi lại lời mời');
  });

  it('keeps customer lifecycle controls admin-only', () => {
    const staffMarkup = renderToStaticMarkup(
      <CustomerDetailPanel
        busy={false}
        customer={sampleCustomer()}
        isAdmin={false}
        onTransition={vi.fn()}
      />,
    );
    const adminMarkup = renderToStaticMarkup(
      <CustomerDetailPanel
        busy={false}
        customer={sampleCustomer()}
        isAdmin
        onTransition={vi.fn()}
      />,
    );

    expect(staffMarkup).toContain('Chỉ quản trị viên');
    expect(staffMarkup).not.toContain('Tạm khóa khách hàng</button>');
    expect(adminMarkup).toContain('Tạm khóa khách hàng');
  });

  it('renders the three customer summary fields and grouped detail from contract data', () => {
    const markup = renderToStaticMarkup(
      <CustomerDetailPanel
        busy={false}
        customer={sampleCustomer({ lastLoginAt: null, lastOrderAt: null })}
        isAdmin
        onTransition={vi.fn()}
      />,
    );

    expect(markup).toContain('Tóm tắt hồ sơ');
    expect(markup).toContain('Số đơn hàng');
    expect(markup).toContain('Đơn gần nhất');
    expect(markup).toContain('Đăng nhập gần nhất');
    expect(markup).toContain('Liên hệ');
    expect(markup).toContain('Hoạt động tài khoản');
    expect(markup).toContain('Chưa có đơn hàng');
    expect(markup).toContain('Chưa đăng nhập');
  });
});

function sampleEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    createdAt: '2026-08-30T01:00:00.000Z',
    email: 'an@example.com',
    employeeCode: 'NV-08',
    fullName: 'Nguyễn An',
    hiredAt: '2026-08-01',
    id: '00000000-0000-4000-8000-000000000008',
    phone: '0909000000',
    status: 'ACTIVE',
    updatedAt: '2026-08-30T01:00:00.000Z',
    ...overrides,
  };
}

function sampleCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    createdAt: '2026-08-30T01:00:00.000Z',
    email: 'lan@example.com',
    fullName: 'Trần Lan',
    id: '00000000-0000-4000-8000-000000000009',
    lastOrderAt: '2026-08-29T03:00:00.000Z',
    orderCount: 3,
    phone: '0908000000',
    status: 'ACTIVE',
    updatedAt: '2026-08-30T01:00:00.000Z',
    ...overrides,
  };
}
