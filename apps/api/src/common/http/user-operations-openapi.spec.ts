import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackofficeRateLimitGuard } from '../../modules/auth/backoffice-rate-limit.guard.js';
import { RolesGuard } from '../../modules/auth/roles.guard.js';
import { SessionGuard } from '../../modules/auth/session.guard.js';
import { CustomerController } from '../../modules/user-operations/customer.controller.js';
import { EmployeeController } from '../../modules/user-operations/employee.controller.js';
import { UserOperationsService } from '../../modules/user-operations/user-operations.service.js';
import { createOpenApiDocument } from '../../openapi/openapi.js';

interface Operation {
  operationId?: string;
  parameters?: Array<{ in?: string; name?: string; schema?: Record<string, unknown> }>;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

const OPERATION_IDS = [
  'activateCustomer',
  'createBackofficeEmployee',
  'disableEmployee',
  'enableEmployee',
  'getBackofficeCustomer',
  'getBackofficeEmployee',
  'listBackofficeCustomers',
  'listBackofficeEmployees',
  'resendEmployeeInvitation',
  'suspendCustomer',
  'updateBackofficeEmployee',
] as const;

describe('Slice 12 user operations OpenAPI contract', () => {
  let app: INestApplication;
  let byId: Map<string | undefined, Operation>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EmployeeController, CustomerController],
      providers: [{ provide: UserOperationsService, useValue: {} }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(BackofficeRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const document = createOpenApiDocument(app);
    const operations = Object.values(document.paths).flatMap((pathItem) =>
      Object.entries(pathItem)
        .filter(([method]) => ['get', 'post', 'patch'].includes(method))
        .map(([, operation]) => operation as Operation),
    );
    byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  });

  afterAll(async () => app.close());

  it('publishes the eleven uniquely named Bearer operations', () => {
    expect([...byId.keys()].sort()).toEqual([...OPERATION_IDS].sort());
    for (const operation of byId.values()) {
      expect(operation.security).toEqual([{ 'access-token': [] }]);
      expect(operation.responses).toMatchObject({ '400': {}, '401': {}, '403': {}, '500': {} });
    }
  });

  it('documents pagination, date filters, UUID paths and delivery result statuses', () => {
    const employeeParams = byId
      .get('listBackofficeEmployees')
      ?.parameters?.filter((parameter) => parameter.in === 'query')
      .map((parameter) => parameter.name);
    expect(employeeParams).toEqual(
      expect.arrayContaining(['q', 'status', 'hiredFrom', 'hiredTo', 'page', 'pageSize']),
    );

    const customerParams = byId
      .get('listBackofficeCustomers')
      ?.parameters?.filter((parameter) => parameter.in === 'query')
      .map((parameter) => parameter.name);
    expect(customerParams).toEqual(
      expect.arrayContaining([
        'q',
        'status',
        'createdFrom',
        'createdTo',
        'sortBy',
        'sortOrder',
        'page',
        'pageSize',
      ]),
    );
    expect(
      byId
        .get('getBackofficeEmployee')
        ?.parameters?.find(({ in: location }) => location === 'path'),
    ).toMatchObject({ name: 'id', schema: { type: 'string', format: 'uuid' } });
    expect(byId.get('createBackofficeEmployee')?.responses).toHaveProperty('201');
  });
});
