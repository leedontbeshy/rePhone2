import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createOpenApiDocument } from '../../openapi/openapi.js';
import {
  BackofficeWarrantyPoliciesController,
  BackofficeWarrantiesController,
  CustomerWarrantiesController,
} from '../../modules/warranty/warranty-operations.controller.js';
import { WarrantyCommandService } from '../../modules/warranty/warranty-command.service.js';
import { WarrantyQueryService } from '../../modules/warranty/warranty-query.service.js';
import { BackofficeRateLimitGuard } from '../../modules/auth/backoffice-rate-limit.guard.js';
import { OptionalSessionGuard } from '../../modules/auth/optional-session.guard.js';
import { RolesGuard } from '../../modules/auth/roles.guard.js';
import { SessionGuard } from '../../modules/auth/session.guard.js';

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

const WARRANTY_OPERATION_IDS = [
  'listCustomerWarranties',
  'getCustomerWarranty',
  'listBackofficeWarrantyPolicies',
  'createWarrantyPolicy',
  'getBackofficeWarrantyPolicy',
  'updateWarrantyPolicy',
  'activateWarrantyPolicy',
  'deactivateWarrantyPolicy',
  'archiveWarrantyPolicy',
  'listBackofficeWarranties',
  'getBackofficeWarranty',
  'voidWarranty',
] as const;

describe('Slice 11 Warranty Operations OpenAPI contract', () => {
  let app: INestApplication;
  let operations: Operation[];
  let byId: Map<string | undefined, Operation>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        CustomerWarrantiesController,
        BackofficeWarrantyPoliciesController,
        BackofficeWarrantiesController,
      ],
      providers: [
        { provide: WarrantyQueryService, useValue: {} },
        { provide: WarrantyCommandService, useValue: {} },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(BackofficeRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const document = createOpenApiDocument(app);
    operations = Object.values(document.paths).flatMap((pathItem) =>
      Object.entries(pathItem)
        .filter(([method]) => ['get', 'post', 'patch'].includes(method))
        .map(([, operation]) => operation as Operation)
        .filter(({ operationId }) => WARRANTY_OPERATION_IDS.includes(operationId as never)),
    );
    byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes exactly twelve uniquely named warranty operations', () => {
    expect(operations).toHaveLength(12);
    expect([...byId.keys()].sort()).toEqual([...WARRANTY_OPERATION_IDS].sort());
  });

  it('documents customer ownership credentials and staff Bearer security', () => {
    expect(byId.get('listCustomerWarranties')?.security).toEqual([{ 'access-token': [] }]);
    expect(byId.get('getCustomerWarranty')?.security).toEqual([
      { 'access-token': [] },
      { guestOrderToken: [] },
      { rephone_guest_cart: [] },
    ]);
    for (const operationId of WARRANTY_OPERATION_IDS.filter(
      (id) => !['listCustomerWarranties', 'getCustomerWarranty'].includes(id),
    )) {
      expect(byId.get(operationId)?.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('documents UUID backoffice params and mutation conflicts/rate limits', () => {
    for (const operationId of [
      'getBackofficeWarrantyPolicy',
      'updateWarrantyPolicy',
      'activateWarrantyPolicy',
      'deactivateWarrantyPolicy',
      'archiveWarrantyPolicy',
      'getBackofficeWarranty',
      'voidWarranty',
    ]) {
      expect(
        byId.get(operationId)?.parameters?.find((parameter) => parameter.in === 'path'),
      ).toMatchObject({
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      });
    }
    for (const operationId of [
      'createWarrantyPolicy',
      'updateWarrantyPolicy',
      'activateWarrantyPolicy',
      'deactivateWarrantyPolicy',
      'archiveWarrantyPolicy',
      'voidWarranty',
    ]) {
      expect(byId.get(operationId)?.responses).toMatchObject({
        '400': {},
        '401': {},
        '403': {},
        '404': {},
        '409': {},
        '429': {},
      });
    }
  });
});
