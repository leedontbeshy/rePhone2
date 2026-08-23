import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Operation {
  operationId?: string;
  parameters?: unknown[];
  requestBody?: { content?: Record<string, unknown> };
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

describe('Slice 04 OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, Operation>> };
  const operations = Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'delete'].includes(method))
      .filter(
        () =>
          path.startsWith('/api/v1/backoffice/') &&
          !path.startsWith('/api/v1/backoffice/vouchers') &&
          !path.startsWith('/api/v1/backoffice/payments') &&
          !path.startsWith('/api/v1/backoffice/orders'),
      )
      .map(([method, operation]) => ({ method, operation, path })),
  );

  it('publishes exactly 40 secured and uniquely named operations', () => {
    expect(operations).toHaveLength(40);
    const operationIds = operations.map(({ operation }) => operation.operationId);
    expect(new Set(operationIds).size).toBe(40);
    for (const { operation } of operations) {
      expect(operation.security).toEqual([{ bearer: [] }]);
    }
  });

  it('describes every dynamic path and every JSON mutation body', () => {
    const bodylessCommands = new Set([
      'publishBackofficeProduct',
      'activateBackofficeVariant',
      'completeBackofficeInventoryInspection',
      'makeBackofficeInventoryUnitAvailable',
    ]);
    for (const { method, operation, path } of operations) {
      if (path.includes('{')) expect(operation.parameters?.length ?? 0).toBeGreaterThan(0);
      if (
        ['post', 'patch'].includes(method) &&
        !bodylessCommands.has(operation.operationId ?? '')
      ) {
        expect(operation.requestBody).toBeDefined();
      }
    }
  });

  it('describes multipart uploads and the Slice 04 error statuses', () => {
    const uploads = operations.filter(({ operation }) =>
      operation.operationId?.startsWith('uploadBackoffice'),
    );
    expect(uploads).toHaveLength(3);
    for (const { operation } of uploads) {
      expect(operation.requestBody?.content).toHaveProperty('multipart/form-data');
      expect(operation.responses).toMatchObject({ '413': {}, '415': {}, '503': {} });
    }
  });
});
