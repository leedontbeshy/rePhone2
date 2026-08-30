import { describe, expect, it, vi } from 'vitest';
import type { Employee } from '@/lib/system-admin-api';
import {
  customerStatusPresentation,
  employeeDraftChanged,
  employeeDraftFromDetail,
  employeeEmailState,
  employeeStatusPresentation,
  employeeUpdateInput,
  focusUserDetailHeading,
  formatUserDate,
  normalizeEmployeeDraft,
  recordAfterRefresh,
  userInitials,
  validateEmployeeDraft,
} from './user-admin-presenter';

describe('user admin presenter', () => {
  it('presents account states in Vietnamese with semantic tones', () => {
    expect(employeeStatusPresentation('PENDING_VERIFICATION')).toEqual({
      label: 'Chờ kích hoạt',
      tone: 'warning',
    });
    expect(employeeStatusPresentation('DISABLED')).toEqual({
      label: 'Đã vô hiệu hóa',
      tone: 'danger',
    });
    expect(customerStatusPresentation('ACTIVE')).toEqual({
      label: 'Đang hoạt động',
      tone: 'success',
    });
  });

  it('builds compact initials and displays date-only values without a timezone shift', () => {
    expect(userInitials('Nguyễn Minh Anh')).toBe('NA');
    expect(userInitials('An')).toBe('AN');
    expect(formatUserDate('2026-08-30')).toBe('30/08/2026');
    expect(formatUserDate(null)).toBe('Chưa có');
  });

  it('normalizes and validates a create draft', () => {
    const draft = {
      email: ' ADMIN@Example.COM ',
      employeeCode: ' nv-08 ',
      fullName: '  Nguyễn An  ',
      hiredAt: '2026-02-30',
      phone: ' 0909000000 ',
    };

    expect(normalizeEmployeeDraft(draft)).toEqual({
      email: 'admin@example.com',
      employeeCode: 'NV-08',
      fullName: 'Nguyễn An',
      hiredAt: '2026-02-30',
      phone: '0909000000',
    });
    expect(validateEmployeeDraft(draft, 'create')).toMatchObject({
      hiredAt: 'Ngày vào làm chưa hợp lệ.',
    });
    expect(
      validateEmployeeDraft(
        { ...draft, email: 'không-phải-email', fullName: '', hiredAt: '2026-08-30' },
        'create',
      ),
    ).toMatchObject({
      email: 'Email chưa đúng định dạng.',
      fullName: 'Nhập họ tên nhân viên.',
    });
  });

  it('emits only changed update fields and clears optional values with null', () => {
    const employee = sampleEmployee();
    const unchanged = employeeDraftFromDetail(employee);
    expect(employeeDraftChanged(employee, unchanged)).toBe(false);
    expect(employeeUpdateInput(employee, unchanged)).toEqual({});

    const changed = { ...unchanged, fullName: '  Nguyễn Bình  ', phone: '', hiredAt: '' };
    expect(employeeDraftChanged(employee, changed)).toBe(true);
    expect(employeeUpdateInput(employee, changed)).toEqual({
      fullName: 'Nguyễn Bình',
      phone: null,
      hiredAt: null,
    });
  });

  it('does not invent invitation delivery time from account timestamps', () => {
    const state = employeeEmailState(sampleEmployee({ status: 'PENDING_VERIFICATION' }));
    expect(state).toBe('Chưa kích hoạt tài khoản');
    expect(state).not.toContain('30/08/2026');
  });

  it('keeps a valid selection after refresh and otherwise selects the first record', () => {
    const first = sampleEmployee({ id: 'employee-1' });
    const second = sampleEmployee({ id: 'employee-2' });

    expect(recordAfterRefresh([first, second], second.id)).toBe(second);
    expect(recordAfterRefresh([first, second], 'employee-missing')).toBe(first);
    expect(recordAfterRefresh([first, second], 'employee-missing', false)).toBeUndefined();
    expect(recordAfterRefresh<Employee>([], first.id)).toBeUndefined();
  });

  it('moves focus to a selected user detail without changing the viewport position', () => {
    const focus = vi.fn();

    focusUserDetailHeading({ focus });
    focusUserDetailHeading(null);

    expect(focus).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
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
