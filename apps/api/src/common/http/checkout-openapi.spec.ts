import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Operation {
  operationId?: string;
  parameters?: Array<{ name?: string }>;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

const EXPECTED_OPERATION_IDS = [
  'previewCheckout',
  'createCheckout',
  'listCustomerOrders',
  'getCustomerOrder',
  'cancelCustomerOrder',
] as const;

describe('Slice 06 OpenAPI contract', () => {
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

  it('publishes exactly five unique operations and all guest credentials', () => {
    expect(operations).toHaveLength(5);
    expect(new Set(operations.map(({ operationId }) => operationId)).size).toBe(5);
    expect([...byId.keys()].sort()).toEqual([...EXPECTED_OPERATION_IDS].sort());
    expect(document.components?.securitySchemes).toHaveProperty('rephone_guest_cart');
    expect(document.components?.securitySchemes).toHaveProperty('guestOrderToken');
  });

  it('documents alternative security instead of accidental combined authentication', () => {
    for (const id of ['previewCheckout', 'createCheckout']) {
      expect(byId.get(id)?.security).toEqual([{ 'access-token': [] }, { rephone_guest_cart: [] }]);
    }
    expect(byId.get('listCustomerOrders')?.security).toEqual([{ 'access-token': [] }]);
    for (const id of ['getCustomerOrder', 'cancelCustomerOrder']) {
      expect(byId.get(id)?.security).toEqual([
        { 'access-token': [] },
        { guestOrderToken: [] },
        { rephone_guest_cart: [] },
      ]);
    }
  });

  it('documents create replay statuses, guest token header and stable error statuses', () => {
    expect(byId.get('createCheckout')?.responses).toEqual(
      expect.objectContaining({ '200': expect.anything(), '201': expect.anything() }),
    );
    for (const id of ['getCustomerOrder', 'cancelCustomerOrder']) {
      expect(byId.get(id)?.parameters?.map(({ name }) => name)).toContain('X-Guest-Order-Token');
    }
    expect(byId.get('createCheckout')?.responses).toEqual(
      expect.objectContaining({
        '400': expect.anything(),
        '401': expect.anything(),
        '403': expect.anything(),
        '409': expect.anything(),
        '422': expect.anything(),
        '429': expect.anything(),
        '503': expect.anything(),
      }),
    );
  });
});
