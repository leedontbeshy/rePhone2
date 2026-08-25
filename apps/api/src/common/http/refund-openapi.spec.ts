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

const REFUND_OPERATION_IDS = [
  'cancelBackofficeOrder',
  'listBackofficeRefunds',
  'getBackofficeRefund',
  'createRefund',
  'startRefundProcessing',
  'completeBankTransferRefund',
  'completeCashRefund',
  'rejectRefund',
  'cancelRefund',
  'getRefundEvidenceUrl',
] as const;

describe('Slice 10 OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, Operation>> };
  const allOperations = Object.values(document.paths).flatMap((pathItem) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
      .map(([, operation]) => operation),
  );
  const operations = allOperations.filter(({ operationId }) =>
    REFUND_OPERATION_IDS.includes(operationId as never),
  );
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

  it('keeps all operation ids unique and includes the ten Slice 10 operations', () => {
    expect(new Set(allOperations.map(({ operationId }) => operationId)).size).toBe(
      allOperations.length,
    );
    expect(operations).toHaveLength(10);
    expect([...byId.keys()].sort()).toEqual([...REFUND_OPERATION_IDS].sort());
  });

  it('protects every cancellation and refund operation with staff Bearer authentication', () => {
    for (const operation of operations) {
      expect(operation.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('declares every resource path parameter as a required UUID', () => {
    for (const operationId of REFUND_OPERATION_IDS.filter(
      (value) => value !== 'listBackofficeRefunds',
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
  });

  it('documents the private bank evidence upload and stable error statuses', () => {
    const completeBank = byId.get('completeBankTransferRefund');
    expect(completeBank?.requestBody?.content).toHaveProperty('multipart/form-data');
    expect(completeBank?.responses).toMatchObject({
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
    expect(byId.get('createRefund')?.responses).toMatchObject({
      '201': {},
      '400': {},
      '401': {},
      '403': {},
      '404': {},
      '409': {},
      '422': {},
      '429': {},
    });
  });

  it('documents the refund queue filters and sorting contract', () => {
    expect(byId.get('listBackofficeRefunds')?.parameters?.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'status',
        'method',
        'orderNumber',
        'createdFrom',
        'createdTo',
        'page',
        'pageSize',
        'sortBy',
        'sortOrder',
      ]),
    );
  });
});
