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
  responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
}

interface OpenApiSchema {
  $ref?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
}

describe('Auth/account OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as {
    components?: { schemas?: Record<string, OpenApiSchema> };
    paths: Record<string, Record<string, Operation>>;
  };
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

  it('publishes one generic registration response without a duplicate-account signal', () => {
    const responses = byId.get('registerAccount')?.responses;
    expect(responses?.['201']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/RegistrationResultResponse',
    );
    expect(responses).not.toHaveProperty('409');

    const schemas = document.components?.schemas;
    expect(schemas?.['RegistrationResultResponse']?.properties?.['data']?.$ref).toBe(
      '#/components/schemas/RegistrationResultDto',
    );
    expect(schemas?.['RegistrationResultDto']).toMatchObject({
      required: ['message'],
      properties: { message: {} },
    });
    expect(Object.keys(schemas?.['RegistrationResultDto']?.properties ?? {})).toEqual(['message']);
  });
});
