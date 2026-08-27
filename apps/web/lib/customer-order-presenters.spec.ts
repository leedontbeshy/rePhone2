import { describe, expect, it } from 'vitest';
import { fulfillmentStatusLabel, warrantyStatusLabel } from './customer-order-presenters';

describe('customer order presenters', () => {
  it('describes pending fulfillment without contradicting a confirmed order', () => {
    expect(fulfillmentStatusLabel('PENDING')).toBe('Chờ chuẩn bị');
    expect(fulfillmentStatusLabel('PENDING')).not.toContain('xác nhận');
  });

  it('uses validity projections instead of treating every active warranty as valid', () => {
    expect(warrantyStatusLabel({ status: 'ACTIVE', isValid: true, isExpired: false })).toBe(
      'Còn hiệu lực',
    );
    expect(warrantyStatusLabel({ status: 'ACTIVE', isValid: false, isExpired: true })).toBe(
      'Đã hết hạn',
    );
    expect(warrantyStatusLabel({ status: 'ACTIVE', isValid: false, isExpired: false })).toBe(
      'Chưa hiệu lực',
    );
    expect(warrantyStatusLabel({ status: 'VOIDED', isValid: false, isExpired: false })).toBe(
      'Đã vô hiệu',
    );
  });
});
