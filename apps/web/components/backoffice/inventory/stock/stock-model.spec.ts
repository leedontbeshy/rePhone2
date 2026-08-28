import { describe, expect, it } from 'vitest';
import {
  buildStockLevelHref,
  buildStockMovementHref,
  emptyStockCommandDraft,
  mergeStockLevelQuery,
  stockLevelQueryFromSearch,
  stockMovementQueryFromSearch,
  validateStockCommand,
} from './stock-model';

const VARIANT_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a03';
const STORE_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a04';
const WAREHOUSE_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a05';
const REFERENCE_ID = '0199c9aa-a258-74c8-a35f-9cd11c562a11';

describe('inventory stock query model', () => {
  it('parses and builds compact stock URLs without navigation-only defaults', () => {
    expect(stockLevelQueryFromSearch(new URLSearchParams())).toEqual({ page: 1, pageSize: 20 });
    const query = stockLevelQueryFromSearch(
      new URLSearchParams(
        `variantId=${VARIANT_ID}&locationId=${STORE_ID}&lowStock=false&page=2&pageSize=40`,
      ),
    );
    expect(query).toEqual({
      variantId: VARIANT_ID,
      locationId: STORE_ID,
      lowStock: false,
      page: 2,
      pageSize: 40,
    });
    expect(buildStockLevelHref({ page: 1, pageSize: 20 })).toBe('/backoffice/inventory/stock');
    expect(buildStockLevelHref(query)).toBe(
      `/backoffice/inventory/stock?variantId=${VARIANT_ID}&locationId=${STORE_ID}&lowStock=false&page=2&pageSize=40`,
    );
    expect(mergeStockLevelQuery(query, { locationId: undefined, page: 1 })).toEqual({
      variantId: VARIANT_ID,
      lowStock: false,
      page: 1,
      pageSize: 40,
    });
  });

  it('keeps only supported movement filters and never puts display data in the URL', () => {
    const query = stockMovementQueryFromSearch(
      new URLSearchParams(
        `variantId=${VARIANT_ID}&locationId=${STORE_ID}&type=TRANSFER&dateFrom=2026-08-01&dateTo=2026-08-31&referenceType=SHIPMENT&referenceId=${REFERENCE_ID}&page=3&ignored=private`,
      ),
    );
    expect(query).toMatchObject({
      variantId: VARIANT_ID,
      locationId: STORE_ID,
      type: 'TRANSFER',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      referenceType: 'SHIPMENT',
      referenceId: REFERENCE_ID,
      page: 3,
      pageSize: 20,
    });
    const href = buildStockMovementHref(query);
    expect(href).toContain('type=TRANSFER');
    expect(href).toContain(`referenceId=${REFERENCE_ID}`);
    expect(href).not.toContain('ignored');
    expect(href).not.toContain('iPhone');
  });
});

describe('inventory stock command model', () => {
  it('builds typed receive and transfer commands with normalized optional reasons', () => {
    const receive = validateStockCommand('receive', {
      ...emptyStockCommandDraft(),
      variantId: VARIANT_ID,
      locationId: STORE_ID,
      quantity: '12',
      reason: '  Nhập lô hàng mới  ',
    });
    expect(receive).toEqual({
      errors: {},
      command: {
        kind: 'receive',
        input: {
          variantId: VARIANT_ID,
          locationId: STORE_ID,
          quantity: 12,
          reason: 'Nhập lô hàng mới',
        },
      },
    });

    const transfer = validateStockCommand('transfer', {
      ...emptyStockCommandDraft(),
      variantId: VARIANT_ID,
      fromLocationId: STORE_ID,
      toLocationId: WAREHOUSE_ID,
      quantity: '4',
    });
    expect(transfer.command).toEqual({
      kind: 'transfer',
      input: {
        variantId: VARIANT_ID,
        fromLocationId: STORE_ID,
        toLocationId: WAREHOUSE_ID,
        quantity: 4,
      },
    });
  });

  it('blocks invalid quantity, same-location transfer and missing reasons before API calls', () => {
    const transfer = validateStockCommand('transfer', {
      ...emptyStockCommandDraft(),
      variantId: VARIANT_ID,
      fromLocationId: STORE_ID,
      toLocationId: STORE_ID,
      quantity: '1.5',
    });
    expect(transfer.command).toBeUndefined();
    expect(transfer.errors).toMatchObject({
      quantity: 'Số lượng phải là số nguyên lớn hơn 0.',
      toLocationId: 'Địa điểm nhận phải khác địa điểm xuất.',
    });

    const adjust = validateStockCommand('adjust', {
      ...emptyStockCommandDraft(),
      variantId: VARIANT_ID,
      locationId: STORE_ID,
      quantity: '2',
      reason: '   ',
    });
    expect(adjust.command).toBeUndefined();
    expect(adjust.errors.reason).toContain('lý do');
  });

  it('requires an audited source and returns a typed return command', () => {
    const invalid = validateStockCommand('return', {
      ...emptyStockCommandDraft(),
      variantId: VARIANT_ID,
      locationId: STORE_ID,
      quantity: '2',
      reason: 'Đơn giao không thành công',
    });
    expect(invalid.errors).toMatchObject({
      referenceType: 'Hãy chọn nguồn hàng hoàn.',
      referenceId: 'Mã tham chiếu chưa đúng định dạng.',
    });

    const valid = validateStockCommand('return', {
      ...emptyStockCommandDraft(),
      variantId: VARIANT_ID,
      locationId: STORE_ID,
      quantity: '2',
      referenceType: 'SHIPMENT',
      referenceId: REFERENCE_ID,
      reason: '  Đơn giao không thành công  ',
    });
    expect(valid.command).toEqual({
      kind: 'return',
      input: {
        variantId: VARIANT_ID,
        locationId: STORE_ID,
        quantity: 2,
        referenceType: 'SHIPMENT',
        referenceId: REFERENCE_ID,
        reason: 'Đơn giao không thành công',
      },
    });
  });
});
