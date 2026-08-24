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

const SHIPPING_OPERATION_IDS = [
  'overrideShippingFee',
  'createShipment',
  'handOverShipment',
  'markShipmentDelivered',
  'markShipmentFailed',
  'markShipmentReturned',
] as const;

describe('Slice 09 OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, Operation>> };
  const allOperations = Object.values(document.paths).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
      .map(([, operation]) => operation),
  );
  const operations = allOperations.filter(({ operationId }) =>
    SHIPPING_OPERATION_IDS.includes(operationId as never),
  );
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

  it('keeps every operation ID unique and includes the six Slice 09 operations', () => {
    expect(new Set(allOperations.map(({ operationId }) => operationId)).size).toBe(
      allOperations.length,
    );
    expect(operations).toHaveLength(6);
    expect([...byId.keys()].sort()).toEqual([...SHIPPING_OPERATION_IDS].sort());
  });

  it('protects every shipping command with staff Bearer authentication', () => {
    for (const operation of operations) {
      expect(operation.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('declares UUID paths and the five command request bodies', () => {
    for (const operationId of SHIPPING_OPERATION_IDS) {
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

    expect(byId.get('handOverShipment')?.requestBody).toBeUndefined();
    for (const operationId of SHIPPING_OPERATION_IDS.filter(
      (value) => value !== 'handOverShipment',
    )) {
      expect(byId.get(operationId)?.requestBody).toBeDefined();
    }
  });

  it('documents create replay and stable mutation error responses', () => {
    expect(byId.get('createShipment')?.responses).toMatchObject({
      '200': {},
      '201': {},
      '400': {},
      '401': {},
      '403': {},
      '404': {},
      '409': {},
      '429': {},
    });
    expect(byId.get('markShipmentDelivered')?.responses).toMatchObject({
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
