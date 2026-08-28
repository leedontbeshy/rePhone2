import { describe, expect, it } from 'vitest';
import type { WarrantyDetail, WarrantyListItem } from '@/lib/warranty-api';
import {
  parseWarrantyPage,
  warrantyJourney,
  warrantyPageHref,
  warrantyStatusLabel,
  warrantyValidity,
} from './warranty-presenters';

describe('warranty presentation', () => {
  it('uses only projected validity for active, not-started, expired and voided states', () => {
    expect(warrantyValidity(warranty({ isValid: true }))).toBe('active');
    expect(warrantyValidity(warranty({ isValid: false, isExpired: false }))).toBe('not-started');
    expect(warrantyValidity(warranty({ isValid: false, isExpired: true }))).toBe('expired');
    expect(warrantyValidity(warranty({ status: 'VOIDED', isValid: false }))).toBe('voided');
    expect(warrantyStatusLabel('not-started')).toBe('Chưa hiệu lực');
    expect(warrantyStatusLabel('expired')).toBe('Đã hết hạn');
  });

  it('builds an honest journey for active, expired and voided warranties', () => {
    const now = new Date('2026-08-28T00:00:00.000Z');
    expect(warrantyJourney(detail(), now).map(({ state }) => state)).toEqual([
      'complete',
      'current',
      'upcoming',
    ]);
    expect(warrantyJourney(detail({ isValid: false, isExpired: true }), now).at(-1)).toMatchObject({
      label: 'Bảo hành đã hết hạn',
      state: 'terminal',
    });
    expect(warrantyJourney(detail({ status: 'VOIDED', isValid: false }), now)[1]).toMatchObject({
      label: 'Bảo hành đã vô hiệu',
      state: 'terminal',
    });
  });

  it('allowlists positive page numbers and keeps page one canonical', () => {
    expect(parseWarrantyPage('2')).toBe(2);
    for (const value of [null, '', '0', '-1', '2.5', 'all'])
      expect(parseWarrantyPage(value)).toBe(1);
    expect(warrantyPageHref(1)).toBe('/warranties');
    expect(warrantyPageHref(3)).toBe('/warranties?page=3');
  });
});

function warranty(overrides: Partial<WarrantyListItem> = {}): WarrantyListItem {
  return {
    warrantyCode: 'RPH-W-20260828-ABC23456',
    orderNumber: 'RPH-20260828-ABC23456',
    orderItemId: '0199b354-d818-7f7c-b966-3932599978d0',
    productName: 'iPhone 15',
    variantName: '128 GB · Đen',
    inventoryCode: 'IP15-001',
    daysSnapshot: 90,
    status: 'ACTIVE',
    startAt: '2026-08-01T00:00:00.000Z',
    endAt: '2026-10-30T00:00:00.000Z',
    isValid: true,
    isExpired: false,
    ...overrides,
  };
}

function detail(overrides: Partial<WarrantyDetail> = {}): WarrantyDetail {
  return {
    ...warranty(overrides),
    sku: 'IP15-128-BLK',
    termsSnapshot: 'Bảo hành phần cứng theo điều khoản đã ghi nhận.',
    maskedIdentifierSuffix: '1234',
    ...overrides,
  };
}
