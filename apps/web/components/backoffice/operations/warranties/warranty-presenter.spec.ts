import { describe, expect, it } from 'vitest';
import type { BackofficeWarrantyDetail } from '@/lib/warranty-api';
import {
  warrantyStatusPresentation,
  warrantyTimeline,
  warrantyValidityPresentation,
} from './warranty-presenter';

describe('warranty presenter', () => {
  it('separates record status from calculated validity', () => {
    expect(warrantyStatusPresentation({ status: 'ACTIVE' })).toEqual({
      label: 'Đang áp dụng',
      tone: 'success',
    });
    expect(
      warrantyValidityPresentation({ isExpired: true, isValid: false, status: 'ACTIVE' }),
    ).toEqual({ label: 'Đã hết hạn', tone: 'neutral' });
    expect(
      warrantyValidityPresentation({ isExpired: false, isValid: true, status: 'VOIDED' }),
    ).toEqual({ label: 'Không còn hiệu lực', tone: 'danger' });
  });

  it('shows irreversible voiding in the timeline', () => {
    const items = warrantyTimeline(detail());
    expect(items.at(-1)).toMatchObject({
      description: 'Hoàn tiền toàn bộ đơn hàng.',
      label: 'Đã vô hiệu bảo hành',
      state: 'danger',
    });
  });
});

function detail(): BackofficeWarrantyDetail {
  return {
    availableActions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    customer: {
      customerId: 'customer-1',
      email: 'khach@example.com',
      name: 'Khách hàng Demo',
      phone: '0900000000',
    },
    daysSnapshot: 365,
    endAt: '2027-01-01T00:00:00.000Z',
    id: 'warranty-1',
    inventoryCode: 'RPH-U-001',
    isExpired: false,
    isValid: false,
    maskedIdentifierSuffix: '1234',
    orderItemId: 'item-1',
    orderNumber: 'RPH-20260829-ABCDEFGH',
    policy: { code: 'BH-365', id: 'policy-1', name: 'Bảo hành một năm' },
    productName: 'iPhone 15',
    sku: 'IP15-128-BLK',
    startAt: '2026-01-01T00:00:00.000Z',
    status: 'VOIDED',
    termsSnapshot: 'Bảo hành lỗi phần cứng theo điều khoản.',
    updatedAt: '2026-08-29T00:00:00.000Z',
    variantName: '128 GB Đen',
    voidReason: 'Hoàn tiền toàn bộ đơn hàng.',
    voidedAt: '2026-08-29T00:00:00.000Z',
    voidedBy: { fullName: 'Quản trị viên', id: 'admin-1' },
    warrantyCode: 'RPH-W-0001',
  };
}
