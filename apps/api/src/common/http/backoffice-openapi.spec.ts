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

interface SchemaProperty {
  $ref?: string;
  allOf?: Array<{ $ref?: string }>;
  default?: unknown;
  items?: { $ref?: string; enum?: unknown[] };
  nullable?: boolean;
  type?: string;
}

interface Schema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

const SLICE_04_OPERATION_IDS = new Set([
  'activateBackofficeVariant',
  'adjustBackofficeStock',
  'archiveBackofficeProduct',
  'archiveBackofficeVariant',
  'completeBackofficeInventoryInspection',
  'createBackofficeInventoryInspection',
  'createBackofficeProduct',
  'createBackofficeVariant',
  'deleteBackofficeProductMedia',
  'getBackofficeInventoryCost',
  'getBackofficeInventoryInspection',
  'getBackofficeInventoryUnit',
  'getBackofficeProduct',
  'intakeBackofficeInventoryUnit',
  'listBackofficeInventoryInspections',
  'listBackofficeInventoryLocations',
  'listBackofficeInventoryUnits',
  'listBackofficeProducts',
  'listBackofficeStockLevels',
  'listBackofficeStockMovements',
  'lookupBackofficeInventoryIdentifier',
  'makeBackofficeInventoryUnitAvailable',
  'publishBackofficeProduct',
  'quarantineBackofficeInventoryUnit',
  'receiveBackofficeStock',
  'returnBackofficeStock',
  'revealBackofficeInventoryIdentifiers',
  'sendBackofficeInventoryUnitToRepair',
  'transferBackofficeInventoryUnit',
  'transferBackofficeStock',
  'updateBackofficeInventoryCost',
  'updateBackofficeInventoryInspection',
  'updateBackofficeInventoryUnit',
  'updateBackofficeProduct',
  'updateBackofficeProductMedia',
  'updateBackofficeVariant',
  'uploadBackofficeInventoryUnitMedia',
  'uploadBackofficeProductMedia',
  'uploadBackofficeVariantMedia',
  'writeOffBackofficeInventoryUnit',
]);

describe('Slice 04 OpenAPI contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), 'openapi/openapi.json'), 'utf8'),
  ) as {
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema> };
  };
  const operations = Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => ['get', 'post', 'patch', 'delete'].includes(method))
      .filter(([, operation]) => SLICE_04_OPERATION_IDS.has(operation.operationId ?? ''))
      .map(([method, operation]) => ({ method, operation, path })),
  );

  it('publishes exactly 40 secured and uniquely named operations', () => {
    expect(operations).toHaveLength(40);
    const operationIds = operations.map(({ operation }) => operation.operationId);
    expect(new Set(operationIds)).toEqual(SLICE_04_OPERATION_IDS);
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

  it('projects reloadable variant media and keeps update brand optional', () => {
    const productListItem = document.components.schemas['BackofficeProductListItemDto'];
    expect(productListItem?.properties?.['primaryMedia']).toMatchObject({
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/BackofficeMediaSummaryDto' }],
    });
    expect(productListItem?.required).toContain('primaryMedia');

    const variant = document.components.schemas['BackofficeVariantDto'];
    expect(variant?.properties?.['media']).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/BackofficeMediaSummaryDto' },
    });
    expect(variant?.required).toContain('media');

    const updateProduct = document.components.schemas['UpdateProductDto'];
    expect(updateProduct?.properties?.['brand']).toBeDefined();
    expect(updateProduct?.properties?.['brand']).not.toHaveProperty('default');
    expect(updateProduct?.required ?? []).not.toContain('brand');
  });

  it('publishes the FE06 inventory, inspection and stock display projections', () => {
    const unit = document.components.schemas['InventoryUnitDetailDto'];
    expect(unit?.properties?.['media']).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/InventoryUnitMediaDto' },
    });
    expect(unit?.properties?.['availableActions']?.items?.enum).toContain('MAKE_AVAILABLE');
    expect(unit?.properties?.['availabilityReadiness']).toMatchObject({
      $ref: '#/components/schemas/InventoryAvailabilityReadinessDto',
    });
    expect(unit?.required ?? []).not.toEqual(
      expect.arrayContaining(['media', 'availableActions', 'availabilityReadiness']),
    );

    const inspection = document.components.schemas['InspectionDetailDto'];
    expect(inspection?.properties?.['inspector']).toMatchObject({
      $ref: '#/components/schemas/InspectionInspectorDto',
    });
    expect(inspection?.properties?.['checklist']).toMatchObject({
      $ref: '#/components/schemas/InspectionChecklistProjectionDto',
    });

    const stockLevel = document.components.schemas['StockLevelDto'];
    expect(stockLevel?.properties?.['product']).toMatchObject({
      $ref: '#/components/schemas/InventoryProductSummaryDto',
    });

    const movement = document.components.schemas['StockMovementDto'];
    expect(movement?.properties?.['variant']).toMatchObject({
      $ref: '#/components/schemas/InventoryVariantSummaryDto',
    });
    expect(movement?.properties?.['fromLocation']).toMatchObject({
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/InventoryLocationDto' }],
    });
    expect(movement?.properties?.['createdBy']).toMatchObject({
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/StockActorDto' }],
    });

    const updateInspection = document.components.schemas['UpdateInspectionDto'];
    expect(updateInspection?.properties?.['cosmeticNotes']).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(updateInspection?.properties?.['repairNotes']).toMatchObject({
      type: 'string',
      nullable: true,
    });
  });
});
