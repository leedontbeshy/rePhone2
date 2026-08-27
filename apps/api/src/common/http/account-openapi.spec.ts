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
}

describe('Auth/account OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, Operation>> };
  const operations = Object.values(document.paths).flatMap((pathItem) => Object.values(pathItem));
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));

  it.each(['updateAccountAddress', 'archiveAccountAddress'])(
    'publishes the UUID address id for %s',
    (operationId) => {
      expect(
        byId
          .get(operationId)
          ?.parameters?.find((parameter) => parameter.in === 'path' && parameter.name === 'id'),
      ).toMatchObject({
        required: true,
        schema: { type: 'string', format: 'uuid' },
      });
    },
  );
});
