import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Operation {
  operationId?: string;
  parameters?: Array<{
    in?: string;
    name?: string;
    required?: boolean;
    schema?: { format?: string; type?: string };
  }>;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

const FULFILLMENT_OPERATION_IDS = [
  'listBackofficeOrders',
  'getBackofficeOrder',
  'updateBackofficeOrderInternalNote',
  'confirmPickupOrder',
  'startPreparingOrder',
  'markPickupReady',
  'extendPickupHold',
  'completePickup',
] as const;

describe('Slice 08 OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, Operation>> };
  const allOperations = Object.values(document.paths).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
      .map(([, operation]) => operation),
  );
  const operations = allOperations.filter(({ operationId }) =>
    FULFILLMENT_OPERATION_IDS.includes(operationId as never),
  );
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

  it('publishes the eight Slice 08 operations with unique operation ids', () => {
    expect(new Set(allOperations.map(({ operationId }) => operationId)).size).toBe(
      allOperations.length,
    );
    expect(operations).toHaveLength(8);
    expect([...byId.keys()].sort()).toEqual([...FULFILLMENT_OPERATION_IDS].sort());
  });

  it('protects every operation with staff Bearer authentication', () => {
    for (const operation of operations) {
      expect(operation.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('declares UUID path parameters and only the three command bodies', () => {
    for (const operationId of FULFILLMENT_OPERATION_IDS.filter(
      (value) => value !== 'listBackofficeOrders',
    )) {
      const parameter = byId
        .get(operationId)
        ?.parameters?.find((candidate) => candidate.in === 'path');
      expect(parameter).toMatchObject({
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      });
    }
    for (const operationId of [
      'updateBackofficeOrderInternalNote',
      'extendPickupHold',
      'completePickup',
    ]) {
      expect(byId.get(operationId)?.requestBody).toBeDefined();
    }
    for (const operationId of ['confirmPickupOrder', 'startPreparingOrder', 'markPickupReady']) {
      expect(byId.get(operationId)?.requestBody).toBeUndefined();
    }
  });

  it('documents list filters and stable command statuses', () => {
    expect(byId.get('listBackofficeOrders')?.parameters?.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'q',
        'status',
        'fulfillmentStatus',
        'paymentStatus',
        'fulfillmentType',
        'locationId',
        'placedFrom',
        'placedTo',
        'pickupOverdue',
        'page',
        'pageSize',
        'sortBy',
        'sortOrder',
      ]),
    );
    expect(byId.get('completePickup')?.responses).toMatchObject({
      '200': {},
      '400': {},
      '401': {},
      '403': {},
      '404': {},
      '409': {},
      '422': {},
      '429': {},
    });
  });
});
