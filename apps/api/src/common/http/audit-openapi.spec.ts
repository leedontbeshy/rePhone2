import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditOperationsController } from '../../modules/audit-operations/audit-operations.controller.js';
import { AuditOperationsService } from '../../modules/audit-operations/audit-operations.service.js';
import { RolesGuard } from '../../modules/auth/roles.guard.js';
import { SessionGuard } from '../../modules/auth/session.guard.js';
import { createOpenApiDocument } from '../../openapi/openapi.js';

interface Operation {
  operationId?: string;
  parameters?: Array<{
    in?: string;
    name?: string;
    required?: boolean;
    schema?: { format?: string; type?: string };
  }>;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

describe('Slice 12 Audit OpenAPI contract', () => {
  let app: INestApplication;
  let byId: Map<string | undefined, Operation>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuditOperationsController],
      providers: [{ provide: AuditOperationsService, useValue: {} }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const document = createOpenApiDocument(app);
    const operations = Object.values(document.paths).flatMap((pathItem) =>
      Object.entries(pathItem)
        .filter(([method]) => method === 'get')
        .map(([, operation]) => operation as Operation),
    );
    byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  });

  afterAll(async () => app.close());

  it('publishes two uniquely named admin Bearer operations', () => {
    expect([...byId.keys()].sort()).toEqual(
      ['getBackofficeAuditLog', 'listBackofficeAuditLogs'].sort(),
    );
    for (const operation of byId.values()) {
      expect(operation.security).toEqual([{ 'access-token': [] }]);
      expect(operation.responses).toMatchObject({ '400': {}, '401': {}, '403': {}, '500': {} });
    }
  });

  it('documents UUID detail and bounded list query parameters', () => {
    expect(
      byId.get('getBackofficeAuditLog')?.parameters?.find((parameter) => parameter.in === 'path'),
    ).toMatchObject({ name: 'id', required: true, schema: { type: 'string', format: 'uuid' } });
    const names = byId
      .get('listBackofficeAuditLogs')
      ?.parameters?.filter((parameter) => parameter.in === 'query')
      .map((parameter) => parameter.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'actorUserId',
        'actorType',
        'action',
        'resourceType',
        'resourceId',
        'requestId',
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
