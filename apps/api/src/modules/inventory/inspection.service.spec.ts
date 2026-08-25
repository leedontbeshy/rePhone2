/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import { IPHONE_CHECKLIST_V1 } from '../../common/domain/iphone-inspection-checklist.js';
import type { ApiError } from '../../common/errors/api-error.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { InspectionRepository } from './inspection.repository.js';
import { InspectionService } from './inspection.service.js';
import type { InventoryRepository, InventoryUnitRecord } from './inventory.repository.js';

const UNIT_ID = id(1);
const INSPECTION_ID = id(2);
const INSPECTOR_ID = id(3);
const OTHER_USER_ID = id(4);
const actor = { actorUserId: INSPECTOR_ID } as AuditActorContext;

describe('InspectionService', () => {
  it('lists inspection summaries with pagination and rejects an unknown unit', async () => {
    const item = inspectionRecord();
    const fixture = serviceFixture({
      inventoryFindUnit: vi.fn(async () => unitRecord()),
      list: vi.fn(async () => ({ items: [item], totalItems: 3 })),
    });

    await expect(fixture.service.list(UNIT_ID, { page: 2, pageSize: 2 })).resolves.toMatchObject({
      items: [{ id: INSPECTION_ID, status: 'DRAFT' }],
      pagination: { page: 2, pageSize: 2, totalItems: 3, totalPages: 2 },
    });

    const missing = serviceFixture({ inventoryFindUnit: vi.fn(async () => null) });
    await expect(missing.service.list(UNIT_ID, { page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    } satisfies Partial<ApiError>);
  });

  it('returns inspection detail and hides missing records behind RESOURCE_NOT_FOUND', async () => {
    const fixture = serviceFixture();
    await expect(fixture.service.get(INSPECTION_ID)).resolves.toMatchObject({
      id: INSPECTION_ID,
      inventoryUnitId: UNIT_ID,
      batteryReplacementStatus: 'ORIGINAL',
    });

    const missing = serviceFixture({ find: vi.fn(async () => null) });
    await expect(missing.service.get(INSPECTION_ID)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    } satisfies Partial<ApiError>);
  });

  it('creates a draft, moves the unit to INSPECTING, and audits the transition', async () => {
    const fixture = serviceFixture();

    await expect(
      fixture.service.create(UNIT_ID, { inspectionType: 'INTAKE' }, actor),
    ).resolves.toMatchObject({ id: INSPECTION_ID, status: 'DRAFT', overallResult: 'INCOMPLETE' });
    expect(fixture.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryUnitId: UNIT_ID,
        inspectorId: INSPECTOR_ID,
        inspectionType: 'INTAKE',
        checks: { schemaVersion: 1, items: {} },
      }),
      expect.anything(),
    );
    expect(fixture.inventory.updateUnit).toHaveBeenCalledWith(
      UNIT_ID,
      { lifecycleStatus: 'INSPECTING' },
      expect.anything(),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({ action: 'inventory.inspection.created' }),
    );
  });

  it.each([
    {
      name: 'the unit row cannot be locked',
      overrides: { lockUnit: vi.fn(async () => false) },
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'the unit disappeared after locking',
      overrides: { inventoryFindUnit: vi.fn(async () => null) },
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'the product is not an iPhone',
      overrides: {
        inventoryFindUnit: vi.fn(async () =>
          unitRecord({ variant: variantRecord({ product: productRecord({ type: 'ACCESSORY' }) }) }),
        ),
      },
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'the variant is quantity-based',
      overrides: {
        inventoryFindUnit: vi.fn(async () =>
          unitRecord({ variant: variantRecord({ inventoryMode: 'QUANTITY' }) }),
        ),
      },
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'the unit is terminal',
      overrides: { inventoryFindUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'SOLD' })) },
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'an AVAILABLE unit is reserved',
      overrides: {
        inventoryFindUnit: vi.fn(async () =>
          unitRecord({ lifecycleStatus: 'AVAILABLE', _count: { media: 1, reservations: 1 } }),
        ),
      },
      error: 'INVENTORY_NOT_AVAILABLE',
    },
    {
      name: 'a draft already exists',
      overrides: { findDraft: vi.fn(async () => inspectionRecord()) },
      error: 'DUPLICATE_RESOURCE',
    },
  ])('rejects create when $name', async ({ overrides, error }) => {
    const fixture = serviceFixture(overrides);

    await expect(
      fixture.service.create(UNIT_ID, { inspectionType: 'INTAKE' }, actor),
    ).rejects.toMatchObject({ code: error });
    expect(fixture.repository.create).not.toHaveBeenCalled();
  });

  it('updates every optional draft field and permits an ADMIN to edit another inspector draft', async () => {
    const fixture = serviceFixture({
      find: vi.fn(async () => inspectionRecord({ inspectorId: OTHER_USER_ID })),
    });
    const checks = partialChecklist('PASS');

    await expect(
      fixture.service.update(
        INSPECTION_ID,
        {
          batteryHealthPercent: 91,
          batteryCycleCount: 240,
          batteryReplacementStatus: 'REPLACED',
          conditionGrade: 'B',
          cosmeticNotes: 'Trầy nhẹ',
          checks,
          repairHistoryStatus: 'KNOWN',
          repairNotes: 'Đã thay pin',
          replacedParts: { battery: true, labels: ['genuine'] },
        },
        actor,
        'ADMIN',
      ),
    ).resolves.toMatchObject({ id: INSPECTION_ID });
    expect(fixture.repository.update).toHaveBeenCalledWith(
      INSPECTION_ID,
      expect.objectContaining({
        batteryHealthPercent: 91,
        batteryCycleCount: 240,
        batteryReplacementStatus: 'REPLACED',
        conditionGrade: 'B',
        cosmeticNotes: 'Trầy nhẹ',
        checks,
        repairHistoryStatus: 'KNOWN',
        repairNotes: 'Đã thay pin',
        replacedParts: { battery: true, labels: ['genuine'] },
      }),
      expect.anything(),
    );
  });

  it.each([
    {
      name: 'the record is missing',
      overrides: { find: vi.fn(async () => null) },
      input: {},
      role: 'EMPLOYEE' as const,
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'the inspection is completed',
      overrides: { find: vi.fn(async () => inspectionRecord({ status: 'COMPLETED' })) },
      input: {},
      role: 'ADMIN' as const,
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'the employee is not the draft owner',
      overrides: { find: vi.fn(async () => inspectionRecord({ inspectorId: OTHER_USER_ID })) },
      input: {},
      role: 'EMPLOYEE' as const,
      error: 'FORBIDDEN',
    },
    {
      name: 'the checklist has an invalid schema',
      overrides: {},
      input: { checks: { schemaVersion: 2, items: {} } },
      role: 'EMPLOYEE' as const,
      error: 'VALIDATION_FAILED',
      detailCode: 'INVALID_CHECKLIST_SCHEMA',
    },
    {
      name: 'replaced parts are not valid JSON',
      overrides: {},
      input: { replacedParts: { callback: () => undefined } },
      role: 'EMPLOYEE' as const,
      error: 'VALIDATION_FAILED',
      detailCode: 'INVALID_JSON_VALUE',
    },
  ])('rejects update when $name', async ({ overrides, input, role, error, detailCode }) => {
    const fixture = serviceFixture(overrides);

    await expect(fixture.service.update(INSPECTION_ID, input, actor, role)).rejects.toMatchObject({
      code: error,
      ...(detailCode === undefined
        ? {}
        : { details: [expect.objectContaining({ code: detailCode })] }),
    });
  });

  it.each([
    {
      name: 'inspection is missing',
      overrides: { find: vi.fn(async () => null) },
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'unit lock is missing',
      overrides: { lockUnit: vi.fn(async () => false) },
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'inspection is no longer a draft',
      overrides: { find: vi.fn(async () => inspectionRecord({ status: 'COMPLETED' })) },
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'actor does not own the draft',
      overrides: { find: vi.fn(async () => inspectionRecord({ inspectorId: OTHER_USER_ID })) },
      error: 'FORBIDDEN',
    },
    {
      name: 'checklist is incomplete',
      overrides: {
        find: vi.fn(async () => inspectionRecord({ checks: partialChecklist('PASS') })),
      },
      error: 'VALIDATION_FAILED',
      detailCode: 'INVALID_CHECKLIST_KEYS',
    },
    {
      name: 'battery health is missing',
      overrides: { find: vi.fn(async () => inspectionRecord({ batteryHealthPercent: null })) },
      error: 'VALIDATION_FAILED',
      detailCode: 'BATTERY_HEALTH_REQUIRED',
    },
    {
      name: 'condition grade is missing',
      overrides: { find: vi.fn(async () => inspectionRecord({ conditionGrade: null })) },
      error: 'VALIDATION_FAILED',
      detailCode: 'CONDITION_GRADE_REQUIRED',
    },
    {
      name: 'known repair history has no note',
      overrides: {
        find: vi.fn(async () =>
          inspectionRecord({ repairHistoryStatus: 'KNOWN', repairNotes: '   ' }),
        ),
      },
      error: 'VALIDATION_FAILED',
      detailCode: 'REPAIR_NOTES_REQUIRED',
    },
  ])('rejects completion when $name', async ({ overrides, error, detailCode }) => {
    const fixture = serviceFixture(overrides);

    await expect(fixture.service.complete(INSPECTION_ID, actor, 'EMPLOYEE')).rejects.toMatchObject({
      code: error,
      ...(detailCode === undefined
        ? {}
        : { details: [expect.objectContaining({ code: detailCode })] }),
    });
    expect(fixture.repository.clearCurrent).not.toHaveBeenCalled();
  });

  it.each([
    ['PASS', 'PASSED'],
    ['FAIL', 'FAILED'],
    ['DEGRADED', 'PARTIAL'],
  ] as const)(
    'completes a %s checklist as %s and audits the new current inspection',
    async (status, result) => {
      const existing = inspectionRecord({ checks: completeChecklist(status) });
      const fixture = serviceFixture({
        find: vi.fn(async () => existing),
        update: vi.fn(async (_id: string, data: Record<string, unknown>) =>
          inspectionRecord({ ...data, checks: existing.checks }),
        ),
      });

      await expect(
        fixture.service.complete(INSPECTION_ID, actor, 'EMPLOYEE'),
      ).resolves.toMatchObject({ status: 'COMPLETED', overallResult: result, isCurrent: true });
      expect(fixture.repository.clearCurrent).toHaveBeenCalledWith(UNIT_ID, expect.anything());
      expect(fixture.repository.update).toHaveBeenCalledWith(
        INSPECTION_ID,
        expect.objectContaining({ status: 'COMPLETED', overallResult: result, isCurrent: true }),
        expect.anything(),
      );
      expect(fixture.audit.write).toHaveBeenCalledWith(
        expect.anything(),
        actor,
        expect.objectContaining({ action: 'inventory.inspection.completed' }),
      );
    },
  );
});

function serviceFixture(overrides: Record<string, unknown> = {}) {
  const transaction = {} as Prisma.TransactionClient;
  const repository = {
    list: vi.fn(async () => ({ items: [inspectionRecord()], totalItems: 1 })),
    find: vi.fn(async () => inspectionRecord()),
    findDraft: vi.fn(async () => null),
    create: vi.fn(async () => inspectionRecord()),
    update: vi.fn(async (_id: string, data: Record<string, unknown>) => inspectionRecord(data)),
    clearCurrent: vi.fn(async () => ({ count: 1 })),
    lockUnit: vi.fn(async () => true),
    ...overrides,
  } as unknown as InspectionRepository;
  const inventory = {
    findUnit:
      (overrides['inventoryFindUnit'] as ReturnType<typeof vi.fn> | undefined) ??
      vi.fn(async () => unitRecord()),
    updateUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'INSPECTING' })),
  } as unknown as InventoryRepository;
  const transactions = {
    run: vi.fn(
      async <T>(_operation: string, work: (client: Prisma.TransactionClient) => Promise<T>) =>
        work(transaction),
    ),
  } as unknown as SerializableTransactionRunner;
  const audit = { write: vi.fn(async () => undefined) } as unknown as AuditWriter;
  return {
    service: new InspectionService(repository, inventory, transactions, audit),
    repository,
    inventory,
    audit,
  };
}

function inspectionRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-08-25T08:00:00.000Z');
  return {
    id: INSPECTION_ID,
    inventoryUnitId: UNIT_ID,
    inspectionType: 'INTAKE' as const,
    status: 'DRAFT' as const,
    overallResult: 'INCOMPLETE' as const,
    isCurrent: false,
    inspectorId: INSPECTOR_ID,
    inspectedAt: null,
    batteryHealthPercent: 95,
    batteryCycleCount: 100,
    batteryReplacementStatus: 'ORIGINAL' as const,
    conditionGrade: 'A' as const,
    cosmeticNotes: null,
    checks: completeChecklist('PASS'),
    repairHistoryStatus: 'NONE_KNOWN' as const,
    repairNotes: null,
    replacedParts: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function unitRecord(overrides: Record<string, unknown> = {}): InventoryUnitRecord {
  return {
    id: UNIT_ID,
    lifecycleStatus: 'RECEIVED',
    variant: variantRecord(),
    _count: { media: 1, reservations: 0 },
    ...overrides,
  } as unknown as InventoryUnitRecord;
}

function variantRecord(overrides: Record<string, unknown> = {}) {
  return {
    inventoryMode: 'SERIALIZED' as const,
    product: productRecord(),
    ...overrides,
  };
}

function productRecord(overrides: Record<string, unknown> = {}) {
  return { type: 'IPHONE' as const, ...overrides };
}

function partialChecklist(status: 'PASS' | 'FAIL' | 'DEGRADED') {
  const [key] = IPHONE_CHECKLIST_V1[0];
  return {
    schemaVersion: 1 as const,
    items: {
      [key]: { status, note: status === 'PASS' ? null : 'Cần xử lý' },
    },
  };
}

function completeChecklist(status: 'PASS' | 'FAIL' | 'DEGRADED') {
  return {
    schemaVersion: 1 as const,
    items: Object.fromEntries(
      IPHONE_CHECKLIST_V1.map(([key]) => [
        key,
        { status, note: status === 'PASS' ? null : 'Cần xử lý' },
      ]),
    ),
  };
}

function id(suffix: number): string {
  return `0198e5b0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
