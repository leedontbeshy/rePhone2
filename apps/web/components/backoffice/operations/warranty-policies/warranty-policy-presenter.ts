import type { WarrantyPolicy } from '@/lib/warranty-api';
import type { OperationsTone } from '../operations-primitives';

export function warrantyPolicyStatusPresentation(
  policy: Pick<WarrantyPolicy, 'isArchived' | 'status'>,
): { label: string; tone: OperationsTone } {
  if (policy.isArchived) return { label: 'Đã lưu trữ', tone: 'neutral' };
  if (policy.status === 'ACTIVE') return { label: 'Đang áp dụng', tone: 'success' };
  return { label: 'Chưa áp dụng', tone: 'warning' };
}

export interface WarrantyPolicyDraft {
  code: string;
  defaultDays: string;
  name: string;
  terms: string;
}

export interface WarrantyPolicyDraftErrors {
  code?: string;
  defaultDays?: string;
  name?: string;
  terms?: string;
}

export function warrantyPolicyDraftFrom(policy: WarrantyPolicy | null): WarrantyPolicyDraft {
  return policy === null
    ? { code: '', defaultDays: '365', name: '', terms: '' }
    : {
        code: policy.code,
        defaultDays: String(policy.defaultDays),
        name: policy.name,
        terms: policy.terms,
      };
}

export function validateWarrantyPolicyDraft(
  draft: WarrantyPolicyDraft,
  creating: boolean,
): WarrantyPolicyDraftErrors {
  const errors: WarrantyPolicyDraftErrors = {};
  const code = draft.code.trim();
  const name = draft.name.trim();
  const terms = draft.terms.trim();
  const days = Number(draft.defaultDays);
  if (creating && (code.length < 1 || code.length > 64)) {
    errors.code = 'Mã chính sách cần từ 1 đến 64 ký tự.';
  }
  if (name.length < 1 || name.length > 255) {
    errors.name = 'Tên chính sách cần từ 1 đến 255 ký tự.';
  }
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    errors.defaultDays = 'Số ngày cần là số nguyên từ 0 đến 3650.';
  }
  if (terms.length < 1 || terms.length > 10_000) {
    errors.terms = 'Điều khoản cần từ 1 đến 10.000 ký tự.';
  }
  return errors;
}

export function formatWarrantyPolicyDate(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parsed);
}
