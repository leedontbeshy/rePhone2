import { describe, expect, it, vi } from 'vitest';
import type { CatalogProductListItem, CatalogProductPage } from '@/lib/backoffice-catalog-api';
import type { CreateVoucherInput, Voucher } from '@/lib/backoffice-voucher-api';
import {
  loadAllVoucherCatalogProducts,
  voucherAllowsOnlyEndDateUpdate,
  voucherEndDateExtensionError,
  voucherUpdateFromEditor,
} from './voucher-editor-logic';

const VOUCHER: Voucher = {
  id: 'voucher-1',
  code: 'THANG9',
  name: 'Ưu đãi tháng 9',
  description: null,
  discountType: 'PERCENT',
  discountValue: '10',
  maxDiscountAmount: '1000000',
  minimumOrderAmount: '0',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-09-30T23:59:59.000Z',
  totalUsageLimit: 100,
  perCustomerLimit: null,
  visibility: 'PUBLIC',
  scopeType: 'ORDER',
  scopeConfig: null,
  status: 'DRAFT',
  usageCounts: { reserved: 0, consumed: 0, released: 0 },
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
};

const EDITOR_INPUT: CreateVoucherInput = {
  code: VOUCHER.code,
  name: 'Tên đã sửa',
  description: null,
  discountType: 'PERCENT',
  discountValue: '15',
  maxDiscountAmount: '1200000',
  minimumOrderAmount: '1000000',
  startsAt: VOUCHER.startsAt,
  endsAt: '2026-10-15T23:59:59.000Z',
  totalUsageLimit: 120,
  perCustomerLimit: null,
  visibility: 'PUBLIC',
  scopeType: 'ORDER',
  scopeConfig: null,
};

describe('voucher editor lifecycle rules', () => {
  it('submits only the end time when a paused voucher has usage history', () => {
    const pausedWithUsage: Voucher = {
      ...VOUCHER,
      status: 'PAUSED',
      usageCounts: { reserved: 0, consumed: 1, released: 0 },
    };

    expect(voucherAllowsOnlyEndDateUpdate(pausedWithUsage)).toBe(true);
    expect(voucherUpdateFromEditor(pausedWithUsage, EDITOR_INPUT)).toEqual({
      endsAt: EDITOR_INPUT.endsAt,
    });
  });

  it('keeps the full editable payload for a voucher without usage history', () => {
    const update = voucherUpdateFromEditor(VOUCHER, EDITOR_INPUT);

    expect(update).not.toHaveProperty('code');
    expect(update).toMatchObject({
      name: 'Tên đã sửa',
      discountValue: '15',
      endsAt: EDITOR_INPUT.endsAt,
      scopeType: 'ORDER',
    });
  });

  it('does not allow shortening the current end time', () => {
    expect(voucherEndDateExtensionError(VOUCHER.endsAt, '2026-09-29T23:59:59.000Z')).toContain(
      'không được sớm hơn',
    );
    expect(voucherEndDateExtensionError(VOUCHER.endsAt, VOUCHER.endsAt)).toBeNull();
    expect(voucherEndDateExtensionError(VOUCHER.endsAt, '2026-10-01T00:00:00.000Z')).toBeNull();
  });
});

describe('voucher product choices', () => {
  it('loads every reported page and removes duplicate products without truncating at 100', async () => {
    const loadPage = vi
      .fn<(page: number, pageSize: number) => Promise<CatalogProductPage>>()
      .mockImplementation((page, pageSize) =>
        Promise.resolve({
          data:
            page === 1
              ? [product('one', 'iPhone 13'), product('two', 'iPhone 14')]
              : [product('two', 'iPhone 14'), product('three', 'iPhone 15')],
          pagination: { page, pageSize, totalItems: 3, totalPages: 2 },
        }),
      );

    const products = await loadAllVoucherCatalogProducts(loadPage);

    expect(loadPage.mock.calls).toEqual([
      [1, 100],
      [2, 100],
    ]);
    expect(products.map(({ id }) => id)).toEqual(['one', 'two', 'three']);
  });

  it('fails visibly when the reported page count exceeds the safety boundary', async () => {
    const loadPage = vi.fn((page: number, pageSize: number): Promise<CatalogProductPage> =>
      Promise.resolve({
        data: [product('one', 'iPhone 13')],
        pagination: { page, pageSize, totalItems: 3, totalPages: 3 },
      }),
    );

    await expect(
      loadAllVoucherCatalogProducts(loadPage, { maximumPages: 2, pageSize: 1 }),
    ).rejects.toThrow('quá lớn');
    expect(loadPage).toHaveBeenCalledTimes(1);
  });
});

function product(id: string, name: string): CatalogProductListItem {
  return {
    id,
    type: 'iphone',
    typeLabel: 'iPhone',
    brand: 'Apple',
    name,
    slug: id,
    status: 'active',
    statusLabel: 'Đang bán',
    releaseYear: 2023,
    variantCount: 1,
    primaryMedia: null,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  };
}
