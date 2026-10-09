import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Operation {
  operationId?: string;
  parameters?: Array<{ in?: string; name?: string }>;
  requestBody?: { content?: Record<string, unknown> };
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

const SLICE_12_OPERATIONS = [
  'listBackofficeEmployees',
  'createBackofficeEmployee',
  'getBackofficeEmployee',
  'updateBackofficeEmployee',
  'resendEmployeeInvitation',
  'disableEmployee',
  'enableEmployee',
  'listBackofficeCustomers',
  'getBackofficeCustomer',
  'suspendCustomer',
  'activateCustomer',
  'getPublicStore',
  'getBackofficeSettings',
  'updateBackofficeSettings',
  'uploadBackofficeBankQr',
  'listBackofficeAuditLogs',
  'getBackofficeAuditLog',
] as const;

describe('Current OpenAPI artifact', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, Operation>>;
    components?: {
      schemas?: Record<string, { properties?: Record<string, { enum?: string[] }> }>;
    };
  };
  const operations = Object.values(document.paths).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
      .map(([, operation]) => operation),
  );
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

  it('retains the 162 storefront operations and unique operation IDs alongside dealer extensions', () => {
    expect(operations.filter(({ operationId }) => !operationId?.startsWith('Dealer'))).toHaveLength(
      162,
    );
    expect(new Set(operations.map(({ operationId }) => operationId)).size).toBe(operations.length);
    expect(SLICE_12_OPERATIONS.every((operationId) => byId.has(operationId))).toBe(true);
  });

  it('keeps public store anonymous and every backoffice operation Bearer-only', () => {
    expect(byId.get('getPublicStore')?.security).toBeUndefined();
    for (const operationId of SLICE_12_OPERATIONS.filter(
      (candidate) => candidate !== 'getPublicStore',
    )) {
      expect(byId.get(operationId)?.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('documents system list filters and the bank QR multipart contract', () => {
    for (const operationId of [
      'listBackofficeEmployees',
      'listBackofficeCustomers',
      'listBackofficeAuditLogs',
    ]) {
      const names = byId
        .get(operationId)
        ?.parameters?.filter(({ in: location }) => location === 'query')
        .map(({ name }) => name);
      expect(names).toEqual(expect.arrayContaining(['page', 'pageSize', 'sortBy', 'sortOrder']));
    }
    expect(byId.get('uploadBackofficeBankQr')?.requestBody?.content).toHaveProperty(
      'multipart/form-data',
    );
    expect(byId.get('uploadBackofficeBankQr')?.responses).toMatchObject({
      '200': {},
      '409': {},
      '413': {},
      '415': {},
      '503': {},
    });
  });

  it('documents every domain error that can cross the HTTP boundary', () => {
    const codes = document.components?.schemas?.['ApiErrorBodyDto']?.properties?.['code']?.enum;
    expect(codes).toEqual(
      expect.arrayContaining([
        'PAYMENT_PROOF_DEADLINE_PASSED',
        'PAYMENT_ALREADY_REVIEWED',
        'DEPOSIT_AMOUNT_INSUFFICIENT',
        'WARRANTY_NOT_ACTIVE',
        'AFTER_SALES_REQUEST_ALREADY_OPEN',
        'AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET',
        'EVIDENCE_REQUIRED',
        'EVIDENCE_INVALID',
      ]),
    );
  });
});
