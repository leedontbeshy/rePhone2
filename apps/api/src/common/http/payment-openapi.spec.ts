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
  requestBody?: { content?: Record<string, unknown> };
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

const PAYMENT_OPERATION_IDS = [
  'submitPaymentProof',
  'listBackofficePayments',
  'getBackofficePayment',
  'getPaymentEvidenceUrl',
  'verifyPayment',
  'rejectPayment',
] as const;

interface OpenApiSchema {
  $ref?: string;
  properties?: Record<string, OpenApiSchema>;
}

describe('Slice 07 OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, Operation>>;
    components?: {
      schemas?: Record<string, OpenApiSchema>;
      securitySchemes?: Record<string, unknown>;
    };
  };
  const allOperations = Object.values(document.paths).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
      .map(([, operation]) => operation),
  );
  const paymentOperations = allOperations.filter(({ operationId }) =>
    PAYMENT_OPERATION_IDS.includes(operationId as never),
  );
  const byId = new Map(paymentOperations.map((operation) => [operation.operationId, operation]));

  it('publishes exactly 87 unique operations including the six Slice 07 operations', () => {
    expect(allOperations).toHaveLength(87);
    expect(new Set(allOperations.map(({ operationId }) => operationId)).size).toBe(87);
    expect(paymentOperations).toHaveLength(6);
    expect([...byId.keys()].sort()).toEqual([...PAYMENT_OPERATION_IDS].sort());
  });

  it('documents alternative guest security and staff-only review security', () => {
    expect(document.components?.securitySchemes).toHaveProperty('rephone_guest_cart');
    expect(document.components?.securitySchemes).toHaveProperty('guestOrderToken');
    expect(byId.get('submitPaymentProof')?.security).toHaveLength(3);
    expect(byId.get('submitPaymentProof')?.security).toEqual(
      expect.arrayContaining([
        { 'access-token': [] },
        { guestOrderToken: [] },
        { rephone_guest_cart: [] },
      ]),
    );
    for (const operationId of PAYMENT_OPERATION_IDS.filter(
      (value) => value !== 'submitPaymentProof',
    )) {
      expect(byId.get(operationId)?.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('documents multipart proof upload and stable payment error statuses', () => {
    const submit = byId.get('submitPaymentProof');
    expect(submit?.requestBody?.content).toHaveProperty('multipart/form-data');
    expect(submit?.responses).toMatchObject({
      '200': {},
      '400': {},
      '401': {},
      '403': {},
      '404': {},
      '409': {},
      '413': {},
      '415': {},
      '422': {},
      '429': {},
      '503': {},
    });
    for (const operationId of ['verifyPayment', 'rejectPayment']) {
      expect(byId.get(operationId)?.responses).toMatchObject({
        '200': {},
        '400': {},
        '401': {},
        '403': {},
        '404': {},
        '409': {},
        '429': {},
      });
    }
  });

  it('declares every templated payment route parameter as a required UUID', () => {
    const expectedParameters = new Map<string, string>([
      ['submitPaymentProof', 'paymentId'],
      ['getBackofficePayment', 'id'],
      ['getPaymentEvidenceUrl', 'id'],
      ['verifyPayment', 'id'],
      ['rejectPayment', 'id'],
    ]);
    for (const [operationId, parameterName] of expectedParameters) {
      const parameter = byId
        .get(operationId)
        ?.parameters?.find((candidate) => candidate.in === 'path');
      expect(parameter).toMatchObject({
        in: 'path',
        name: parameterName,
        required: true,
      });
      expect(parameter?.schema).toMatchObject({ type: 'string', format: 'uuid' });
    }
  });

  it('models the paginated review queue with the runtime meta.pagination envelope', () => {
    const schemas = document.components?.schemas;
    expect(schemas?.['BackofficePaymentListResponse']?.properties?.['meta']?.$ref).toBe(
      '#/components/schemas/BackofficePaymentListMetaDto',
    );
    expect(schemas?.['BackofficePaymentListMetaDto']?.properties?.['pagination']?.$ref).toBe(
      '#/components/schemas/PaginationDto',
    );
  });
});
