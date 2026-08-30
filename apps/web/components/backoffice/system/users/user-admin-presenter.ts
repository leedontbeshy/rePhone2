import type { Customer, Employee } from '@/lib/system-admin-api';

export type UserAdminTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface UserStatusPresentation {
  readonly label: string;
  readonly tone: UserAdminTone;
}

export interface EmployeeDraft {
  readonly email: string;
  readonly employeeCode: string;
  readonly fullName: string;
  readonly hiredAt: string;
  readonly phone: string;
}

export type EmployeeDraftField = keyof EmployeeDraft;
export type EmployeeDraftErrors = Partial<Record<EmployeeDraftField, string>>;

export const EMPTY_EMPLOYEE_DRAFT: EmployeeDraft = {
  email: '',
  employeeCode: '',
  fullName: '',
  hiredAt: '',
  phone: '',
};

export function employeeStatusPresentation(status: Employee['status']): UserStatusPresentation {
  if (status === 'ACTIVE') return { label: 'Đang hoạt động', tone: 'success' };
  if (status === 'PENDING_VERIFICATION') return { label: 'Chờ kích hoạt', tone: 'warning' };
  return { label: 'Đã vô hiệu hóa', tone: 'danger' };
}

export function customerStatusPresentation(status: Customer['status']): UserStatusPresentation {
  return status === 'ACTIVE'
    ? { label: 'Đang hoạt động', tone: 'success' }
    : { label: 'Đang tạm khóa', tone: 'danger' };
}

export function userInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NV';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return `${first}${last}`.toLocaleUpperCase('vi-VN');
}

export function userAvatarTone(identity: string): 'blue' | 'green' | 'amber' | 'purple' | 'rose' {
  const tones = ['blue', 'green', 'amber', 'purple', 'rose'] as const;
  let checksum = 0;
  for (const character of identity) {
    checksum = (checksum + (character.codePointAt(0) ?? 0)) % tones.length;
  }
  return tones[checksum] ?? 'blue';
}

export function formatUserDate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Chưa có';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return value;
  return `${match[3] ?? ''}/${match[2] ?? ''}/${match[1] ?? ''}`;
}

export function formatUserDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Chưa có';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

export function employeeDraftFromDetail(employee: Employee): EmployeeDraft {
  return {
    email: employee.email,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    hiredAt: employee.hiredAt ?? '',
    phone: employee.phone ?? '',
  };
}

export function normalizeEmployeeDraft(draft: EmployeeDraft): EmployeeDraft {
  return {
    email: draft.email.trim().toLocaleLowerCase('en-US'),
    employeeCode: draft.employeeCode.trim().toLocaleUpperCase('en-US'),
    fullName: draft.fullName.trim(),
    hiredAt: draft.hiredAt,
    phone: draft.phone.trim(),
  };
}

export function validateEmployeeDraft(
  draft: EmployeeDraft,
  mode: 'create' | 'edit',
): EmployeeDraftErrors {
  const normalized = normalizeEmployeeDraft(draft);
  const errors: EmployeeDraftErrors = {};
  if (mode === 'create') {
    if (normalized.email === '') errors.email = 'Nhập email của nhân viên.';
    else if (
      normalized.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)
    ) {
      errors.email = 'Email chưa đúng định dạng.';
    }
  }
  if (normalized.fullName === '') errors.fullName = 'Nhập họ tên nhân viên.';
  else if (normalized.fullName.length > 255) errors.fullName = 'Họ tên không quá 255 ký tự.';
  if (normalized.employeeCode === '') errors.employeeCode = 'Nhập mã nhân viên.';
  else if (normalized.employeeCode.length > 64) {
    errors.employeeCode = 'Mã nhân viên không quá 64 ký tự.';
  }
  if (normalized.phone.length > 32) errors.phone = 'Số điện thoại không quá 32 ký tự.';
  if (normalized.hiredAt !== '' && !isDateOnly(normalized.hiredAt)) {
    errors.hiredAt = 'Ngày vào làm chưa hợp lệ.';
  }
  return errors;
}

export function employeeDraftChanged(employee: Employee, draft: EmployeeDraft): boolean {
  const normalized = normalizeEmployeeDraft(draft);
  return (
    normalized.fullName !== employee.fullName ||
    normalized.employeeCode !== employee.employeeCode ||
    normalized.phone !== (employee.phone ?? '') ||
    normalized.hiredAt !== (employee.hiredAt ?? '')
  );
}

export function employeeUpdateInput(employee: Employee, draft: EmployeeDraft) {
  const normalized = normalizeEmployeeDraft(draft);
  return {
    ...(normalized.fullName === employee.fullName ? {} : { fullName: normalized.fullName }),
    ...(normalized.employeeCode === employee.employeeCode
      ? {}
      : { employeeCode: normalized.employeeCode }),
    ...(normalized.phone === (employee.phone ?? '')
      ? {}
      : { phone: normalized.phone === '' ? null : normalized.phone }),
    ...(normalized.hiredAt === (employee.hiredAt ?? '')
      ? {}
      : { hiredAt: normalized.hiredAt === '' ? null : normalized.hiredAt }),
  };
}

export function employeeEmailState(employee: Employee): string {
  if (employee.emailVerifiedAt !== null && employee.emailVerifiedAt !== undefined) {
    return `Đã xác minh ${formatUserDateTime(employee.emailVerifiedAt)}`;
  }
  return employee.status === 'PENDING_VERIFICATION'
    ? 'Chưa kích hoạt tài khoản'
    : 'Chưa xác minh email';
}

export function recordAfterRefresh<T extends { readonly id: string }>(
  records: readonly T[],
  selectedId: string | undefined,
  fallbackToFirst = true,
): T | undefined {
  return (
    records.find((record) => record.id === selectedId) ?? (fallbackToFirst ? records[0] : undefined)
  );
}

function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
