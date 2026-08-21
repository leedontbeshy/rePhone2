import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Operation {
  operationId?: string;
  parameters?: Array<{ name?: string }>;
  requestBody?: {
    content?: Record<string, { schema?: { oneOf?: unknown[]; discriminator?: unknown } }>;
  };
  responses?: Record<string, { headers?: Record<string, unknown> }>;
  security?: Array<Record<string, unknown>>;
}

const EXPECTED_OPERATION_IDS = [
  'getCart',
  'addCartItem',
  'updateCartItem',
  'removeCartItem',
  'mergeCart',
  'getWishlist',
  'addWishlistItem',
  'removeWishlistItem',
  'listPublicVouchers',
  'listBackofficeVouchers',
  'createVoucher',
  'getBackofficeVoucher',
  'updateVoucher',
  'activateVoucher',
  'pauseVoucher',
  'archiveVoucher',
  'listVoucherUsages',
] as const;

describe('Slice 05 OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, Operation>>;
    components?: { securitySchemes?: Record<string, unknown> };
  };
  const operations = Object.values(document.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .filter((operation) => EXPECTED_OPERATION_IDS.includes(operation.operationId as never));
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

  it('publishes exactly 17 uniquely named operations and the guest cookie scheme', () => {
    expect(operations).toHaveLength(17);
    expect(new Set(operations.map(({ operationId }) => operationId)).size).toBe(17);
    expect([...byId.keys()].sort()).toEqual([...EXPECTED_OPERATION_IDS].sort());
    expect(document.components?.securitySchemes).toHaveProperty('rephone_guest_cart');
  });

  it('expresses anonymous, bearer and guest cookie alternatives without accidental AND auth', () => {
    expect(byId.get('getCart')?.security).toEqual([
      {},
      { 'access-token': [] },
      { rephone_guest_cart: [] },
    ]);
    for (const id of ['addCartItem', 'updateCartItem', 'removeCartItem']) {
      expect(byId.get(id)?.security).toEqual([{ 'access-token': [] }, { rephone_guest_cart: [] }]);
    }
    expect(byId.get('listPublicVouchers')?.security).toEqual([{}, { 'access-token': [] }]);
    expect(byId.get('mergeCart')?.security).toEqual([{ 'access-token': [] }]);
    for (const id of EXPECTED_OPERATION_IDS.filter(
      (candidate) =>
        candidate.startsWith('getWishlist') ||
        candidate.includes('Wishlist') ||
        (candidate.includes('Voucher') && candidate !== 'listPublicVouchers'),
    )) {
      expect(byId.get(id)?.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('documents discriminated targets, conditional CSRF, Set-Cookie and voucher filters', () => {
    const addCart = byId.get('addCartItem');
    const cartSchema = addCart?.requestBody?.content?.['application/json']?.schema;
    expect(cartSchema?.oneOf).toHaveLength(2);
    expect(cartSchema?.discriminator).toMatchObject({ propertyName: 'itemType' });
    expect(addCart?.parameters?.map(({ name }) => name)).toContain('X-Rephone-CSRF');
    expect(addCart?.responses?.['201']?.headers).toHaveProperty('Set-Cookie');

    const addWishlist = byId.get('addWishlistItem');
    expect(addWishlist?.requestBody?.content?.['application/json']?.schema?.oneOf).toHaveLength(2);
    expect(byId.get('listPublicVouchers')?.parameters?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['visibility', 'page', 'pageSize']),
    );
    expect(byId.get('listVoucherUsages')?.parameters?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['status', 'orderId', 'customerId', 'page', 'pageSize']),
    );
    for (const [operationId, parameter] of [
      ['updateCartItem', 'itemId'],
      ['removeCartItem', 'itemId'],
      ['removeWishlistItem', 'itemId'],
      ['getBackofficeVoucher', 'id'],
      ['updateVoucher', 'id'],
      ['activateVoucher', 'id'],
      ['pauseVoucher', 'id'],
      ['archiveVoucher', 'id'],
      ['listVoucherUsages', 'id'],
    ] as const) {
      expect(byId.get(operationId)?.parameters?.map(({ name }) => name)).toContain(parameter);
    }
  });
});
