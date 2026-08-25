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

const AFTER_SALES_OPERATION_IDS = [
  'listCustomerAfterSalesRequests',
  'createAfterSalesRequest',
  'getAfterSalesRequest',
  'uploadAfterSalesAttachment',
  'getAfterSalesAttachmentUrl',
  'cancelAfterSalesRequest',
  'listBackofficeAfterSalesRequests',
  'getBackofficeAfterSalesRequest',
  'getBackofficeAfterSalesAttachmentUrl',
  'assignAfterSalesRequest',
  'receiveAfterSalesRequest',
  'startAfterSalesInspection',
  'recordAfterSalesInspectionSummary',
  'approveAfterSalesRequest',
  'rejectAfterSalesRequest',
  'resolveAfterSalesRepaired',
  'resolveAfterSalesReplaced',
  'resolveAfterSalesRefunded',
  'resolveAfterSalesReturnedUnchanged',
  'resolveAfterSalesOther',
] as const;

describe('Slice 11 After-sales OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, Operation>> };
  const allOperations = Object.values(document.paths).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
      .map(([, operation]) => operation),
  );
  const operations = allOperations.filter(({ operationId }) =>
    AFTER_SALES_OPERATION_IDS.includes(operationId as never),
  );
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

  it('publishes exactly 143 unique operations including twenty After-sales operations', () => {
    expect(allOperations).toHaveLength(143);
    expect(new Set(allOperations.map(({ operationId }) => operationId)).size).toBe(143);
    expect(operations).toHaveLength(20);
    expect([...byId.keys()].sort()).toEqual([...AFTER_SALES_OPERATION_IDS].sort());
  });

  it('documents customer and guest credential alternatives without weakening staff routes', () => {
    expect(byId.get('listCustomerAfterSalesRequests')?.security).toEqual([{ 'access-token': [] }]);
    for (const operationId of [
      'createAfterSalesRequest',
      'getAfterSalesRequest',
      'uploadAfterSalesAttachment',
      'getAfterSalesAttachmentUrl',
      'cancelAfterSalesRequest',
    ]) {
      expect(byId.get(operationId)?.security).toEqual([
        { 'access-token': [] },
        { guestOrderToken: [] },
        { rephone_guest_cart: [] },
      ]);
    }
    for (const operationId of AFTER_SALES_OPERATION_IDS.slice(6)) {
      expect(byId.get(operationId)?.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('publishes private multipart upload and stable failure responses', () => {
    const upload = byId.get('uploadAfterSalesAttachment');
    expect(upload?.requestBody?.content).toHaveProperty('multipart/form-data');
    expect(upload?.responses).toMatchObject({
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
    expect(byId.get('resolveAfterSalesReplaced')?.responses).toMatchObject({
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

  it('declares UUID backoffice resource parameters', () => {
    for (const operationId of AFTER_SALES_OPERATION_IDS.slice(7)) {
      const parameter = byId
        .get(operationId)
        ?.parameters?.find((candidate) => candidate.in === 'path' && candidate.name === 'id');
      expect(parameter).toMatchObject({
        required: true,
        schema: { type: 'string', format: 'uuid' },
      });
    }
  });
});
