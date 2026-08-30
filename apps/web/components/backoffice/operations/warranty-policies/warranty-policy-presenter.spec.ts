import { describe, expect, it } from 'vitest';
import {
  validateWarrantyPolicyDraft,
  warrantyPolicyStatusPresentation,
} from './warranty-policy-presenter';

describe('warranty policy presenter', () => {
  it('maps lifecycle values to Vietnamese labels', () => {
    expect(warrantyPolicyStatusPresentation({ isArchived: true, status: 'INACTIVE' })).toEqual({
      label: 'Đã lưu trữ',
      tone: 'neutral',
    });
  });

  it('validates every policy field before mutation', () => {
    expect(
      validateWarrantyPolicyDraft({ code: '', defaultDays: '3.5', name: '', terms: '' }, true),
    ).toEqual({
      code: 'Mã chính sách cần từ 1 đến 64 ký tự.',
      defaultDays: 'Số ngày cần là số nguyên từ 0 đến 3650.',
      name: 'Tên chính sách cần từ 1 đến 255 ký tự.',
      terms: 'Điều khoản cần từ 1 đến 10.000 ký tự.',
    });
  });
});
