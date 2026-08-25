/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { IdentifierValidationError, type ProtectedIdentifier } from './identifier-protection.js';
import type { IdentifierProtectionService } from './identifier-protection.service.js';
import type { UpdateInventoryUnitDto } from './inventory.dto.js';
import type { InventoryRepository, InventoryUnitRecord } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

const UNIT_ID = id(1);
const VARIANT_ID = id(2);
const PRODUCT_ID = id(3);
const LOCATION_ID = id(4);
const NEXT_LOCATION_ID = id(5);
const USER_ID = id(6);
const actor = { actorUserId: USER_ID } as AuditActorContext;

describe('InventoryService projections and identifiers', () => {
  it('lists masked identifiers/current inspection with stable pagination', async () => {
    const unit = unitRecord({
      imei1Suffix: '1234',
      imei2Suffix: '5678',
      serialSuffix: 'CDEF',
      eidSuffix: '9999',
      inspections: [inspectionSummary()],
    });
    const fixture = serviceFixture({
      listUnits: vi.fn(async () => ({ items: [unit], totalItems: 3 })),
    });

    await expect(
      fixture.service.listUnits({
        page: 2,
        pageSize: 2,
        sortBy: 'receivedAt',
        sortOrder: 'desc',
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: UNIT_ID,
          maskedIdentifiers: [
            { type: 'IMEI_1', maskedValue: '•••• 1234' },
            { type: 'IMEI_2', maskedValue: '•••• 5678' },
            { type: 'SERIAL', maskedValue: '•••• CDEF' },
            { type: 'EID', maskedValue: '•••• 9999' },
          ],
          currentInspection: { overallResult: 'PASSED' },
        },
      ],
      pagination: { page: 2, pageSize: 2, totalItems: 3, totalPages: 2 },
    });
  });

  it('returns unit detail and maps absent records to RESOURCE_NOT_FOUND', async () => {
    const fixture = serviceFixture();
    await expect(fixture.service.getUnit(UNIT_ID)).resolves.toMatchObject({
      id: UNIT_ID,
      product: { id: PRODUCT_ID },
      variant: { id: VARIANT_ID },
      currentInspection: null,
    });

    const missing = serviceFixture({ findUnit: vi.fn(async () => null) });
    await expect(missing.service.getUnit(UNIT_ID)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    } satisfies Partial<ApiError>);
  });

  it('looks up an identifier, audits only the reason/type, and returns the safe projection', async () => {
    const fixture = serviceFixture();

    await expect(
      fixture.service.lookupIdentifier(
        { type: 'SERIAL', value: 'ABC123', reason: 'Đối chiếu bảo hành' },
        actor,
      ),
    ).resolves.toMatchObject({ id: UNIT_ID, maskedIdentifiers: [] });
    expect(fixture.identifiers.lookupHmac).toHaveBeenCalledWith('SERIAL', 'ABC123');
    expect(fixture.repository.findByIdentifier).toHaveBeenCalledWith(
      'SERIAL',
      'SERIAL:ABC123',
      expect.anything(),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({
        action: 'inventory.identifier.lookup',
        metadata: { reason: 'Đối chiếu bảo hành', identifierType: 'SERIAL' },
      }),
    );
  });

  it('maps invalid lookup input and missing lookup results safely', async () => {
    const invalid = serviceFixture({
      lookupHmac: vi.fn(() => {
        throw new IdentifierValidationError('IMEI');
      }),
    });
    await expect(
      invalid.service.lookupIdentifier(
        { type: 'IMEI', value: 'bad', reason: 'Kiểm tra máy' },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [expect.objectContaining({ field: 'value', code: 'INVALID_IMEI' })],
    });

    const missing = serviceFixture({ findByIdentifier: vi.fn(async () => null) });
    await expect(
      missing.service.lookupIdentifier(
        { type: 'SERIAL', value: 'ABC123', reason: 'Kiểm tra máy' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('reveals only present encrypted identifiers after the audit is written', async () => {
    const fixture = serviceFixture({
      findUnit: vi.fn(async () =>
        unitRecord({
          imei1Encrypted: 'enc-imei',
          imei2Encrypted: null,
          serialEncrypted: 'enc-serial',
          eidEncrypted: null,
        }),
      ),
    });

    await expect(
      fixture.service.revealIdentifiers(UNIT_ID, { reason: 'Đối soát hồ sơ' }, actor),
    ).resolves.toEqual({
      imei1: 'plain:enc-imei:1',
      imei2: null,
      serial: 'plain:enc-serial:1',
      eid: null,
    });
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({
        action: 'inventory.identifier.reveal',
        metadata: { reason: 'Đối soát hồ sơ', identifierTypes: ['IMEI', 'SERIAL'] },
      }),
    );
  });

  it('rejects reveal for a missing unit', async () => {
    const fixture = serviceFixture({ findUnit: vi.fn(async () => null) });
    await expect(
      fixture.service.revealIdentifiers(UNIT_ID, { reason: 'Đối soát hồ sơ' }, actor),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});

describe('InventoryService intake and update', () => {
  it.each([
    {
      name: 'locked device has no carrier',
      input: intakeInput({ simLockStatus: 'CARRIER_LOCKED', carrierName: undefined }),
      detail: 'CARRIER_REQUIRED',
    },
    {
      name: 'unlocked device carries a carrier',
      input: intakeInput({ simLockStatus: 'UNLOCKED', carrierName: 'Carrier' }),
      detail: 'CARRIER_FORBIDDEN',
    },
    {
      name: 'compare-at price is below sale price',
      input: intakeInput({ salePrice: '200', compareAtPrice: '100' }),
      detail: 'COMPARE_AT_PRICE_TOO_LOW',
    },
  ])('rejects intake when $name', async ({ input, detail }) => {
    const fixture = serviceFixture();
    await expect(fixture.service.intake(input, actor)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [expect.objectContaining({ code: detail })],
    });
  });

  it('maps identifier validation and rejects equal IMEI slots before persistence', async () => {
    const invalid = serviceFixture({
      protect: vi.fn((type: string) => {
        throw new IdentifierValidationError(type as 'IMEI');
      }),
    });
    await expect(
      invalid.service.intake(intakeInput({ imei1: 'bad' }), actor),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [expect.objectContaining({ field: 'identifiers', code: 'INVALID_IMEI' })],
    });

    const duplicateSlots = serviceFixture({
      protect: vi.fn(() => protectedIdentifier('same')),
    });
    await expect(
      duplicateSlots.service.intake(intakeInput({ imei1: 'one', imei2: 'two' }), actor),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [expect.objectContaining({ field: 'imei2', code: 'IMEI_SLOTS_MUST_DIFFER' })],
    });
  });

  it.each([
    {
      name: 'variant is missing',
      transaction: transactionFixture({ variant: null }),
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'location is missing',
      transaction: transactionFixture({ location: null }),
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'variant is not a sellable serialized iPhone',
      transaction: transactionFixture({
        variant: variantRecord({ inventoryMode: 'QUANTITY' }),
      }),
      error: 'VALIDATION_FAILED',
    },
    {
      name: 'location is inactive',
      transaction: transactionFixture({ location: locationRecord({ status: 'INACTIVE' }) }),
      error: 'VALIDATION_FAILED',
    },
  ])('rejects intake when $name', async ({ transaction, error }) => {
    const fixture = serviceFixture({ transaction });
    await expect(fixture.service.intake(intakeInput(), actor)).rejects.toMatchObject({
      code: error,
    });
    expect(fixture.repository.createUnit).not.toHaveBeenCalled();
  });

  it('rejects a duplicate protected identifier after locking all keys', async () => {
    const fixture = serviceFixture({
      findDuplicateIdentifier: vi.fn(async () => ({ id: UNIT_ID })),
    });
    await expect(
      fixture.service.intake(
        intakeInput({ imei1: 'imei-one', serial: 'serial-one', eid: 'eid-one' }),
        actor,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });
    expect(fixture.repository.lockIdentifierKeys).toHaveBeenCalledWith(
      [
        { type: 'IMEI', hmac: 'IMEI:imei-one' },
        { type: 'SERIAL', hmac: 'SERIAL:serial-one' },
        { type: 'EID', hmac: 'EID:eid-one' },
      ],
      expect.anything(),
    );
  });

  it('creates a normalized protected unit and writes a redacted audit event', async () => {
    const fixture = serviceFixture();
    const input = intakeInput({
      modelNumber: ' mt-vx ',
      regionCode: ' vn a ',
      imei1: 'imei-one',
      imei2: 'imei-two',
      serial: 'serial-one',
      eid: 'eid-one',
      warrantyDaysOverride: 180,
    });

    await expect(fixture.service.intake(input, actor)).resolves.toMatchObject({ id: UNIT_ID });
    expect(fixture.repository.createUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        modelNumber: 'MT-VX',
        regionCode: 'VNA',
        lifecycleStatus: 'RECEIVED',
        identifierKeyVersion: 1,
        imei1Hmac: 'IMEI:imei-one',
        imei2Hmac: 'IMEI:imei-two',
        serialHmac: 'SERIAL:serial-one',
        eidHmac: 'EID:eid-one',
        warrantyDaysOverride: 180,
        inventoryCode: expect.stringMatching(/^RPH-U-[23456789A-HJ-NP-Z]{8}$/),
      }),
      expect.anything(),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({
        action: 'inventory.unit.intake.created',
        changes: {
          after: expect.objectContaining({ identifierTypes: ['IMEI', 'IMEI', 'SERIAL', 'EID'] }),
        },
      }),
    );
  });

  it('maps a Prisma unique violation from intake and preserves unrelated failures', async () => {
    const unique = serviceFixture({
      createUnit: vi.fn(async () => {
        throw Object.assign(new Error('unique violation'), { code: 'P2002' });
      }),
    });
    await expect(unique.service.intake(intakeInput(), actor)).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE',
    });

    const failure = new Error('database offline');
    const generic = serviceFixture({ createUnit: vi.fn(async () => Promise.reject(failure)) });
    await expect(generic.service.intake(intakeInput(), actor)).rejects.toBe(failure);
  });

  it.each([
    {
      name: 'unit is missing',
      existing: null,
      input: {},
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'identifier changes on a terminal unit',
      existing: unitRecord({ lifecycleStatus: 'SOLD' }),
      input: { serial: 'NEW123' },
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'available identifier correction has no reason',
      existing: unitRecord({ lifecycleStatus: 'AVAILABLE' }),
      input: { serial: 'NEW123' },
      error: 'VALIDATION_FAILED',
      detail: 'IDENTIFIER_CORRECTION_REASON_REQUIRED',
    },
    {
      name: 'price changes on a sold unit',
      existing: unitRecord({ lifecycleStatus: 'SOLD' }),
      input: { salePrice: '100' },
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'carrier pairing is invalid',
      existing: unitRecord(),
      input: { simLockStatus: 'CARRIER_LOCKED' },
      error: 'VALIDATION_FAILED',
      detail: 'CARRIER_REQUIRED',
    },
    {
      name: 'price pairing is invalid',
      existing: unitRecord({ salePrice: decimal('200'), compareAtPrice: decimal('300') }),
      input: { compareAtPrice: '100' },
      error: 'VALIDATION_FAILED',
      detail: 'COMPARE_AT_PRICE_TOO_LOW',
    },
  ])('rejects update when $name', async ({ existing, input, error, detail }) => {
    const fixture = serviceFixture({ findUnit: vi.fn(async () => existing) });
    await expect(
      fixture.service.updateUnit(UNIT_ID, input as UpdateInventoryUnitDto, actor),
    ).rejects.toMatchObject({
      code: error,
      ...(detail === undefined ? {} : { details: [expect.objectContaining({ code: detail })] }),
    });
    expect(fixture.repository.updateUnit).not.toHaveBeenCalled();
  });

  it('rejects duplicate identifiers and maps persistence uniqueness on update', async () => {
    const duplicate = serviceFixture({
      findDuplicateIdentifier: vi.fn(async () => ({ id: id(9) })),
    });
    await expect(
      duplicate.service.updateUnit(
        UNIT_ID,
        { serial: 'NEW123', reason: 'Sửa serial theo biên bản' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });

    const unique = serviceFixture({
      updateUnit: vi.fn(async () => {
        throw Object.assign(new Error('unique violation'), { code: 'P2002' });
      }),
    });
    await expect(
      unique.service.updateUnit(UNIT_ID, { modelNumber: 'A' }, actor),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE',
    });
  });

  it('updates protected identifiers and normal fields with a safe identifier audit', async () => {
    const fixture = serviceFixture({
      findUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'AVAILABLE' })),
    });
    await expect(
      fixture.service.updateUnit(
        UNIT_ID,
        {
          modelNumber: ' a 1 ',
          regionCode: ' vn a ',
          simLockStatus: 'UNLOCKED',
          serial: 'NEW123',
          salePrice: '110',
          compareAtPrice: '120',
          warrantyDaysOverride: 90,
          reason: 'Sửa serial theo biên bản',
        },
        actor,
      ),
    ).resolves.toMatchObject({ id: UNIT_ID });
    expect(fixture.repository.updateUnit).toHaveBeenCalledWith(
      UNIT_ID,
      expect.objectContaining({
        modelNumber: 'A1',
        regionCode: 'VNA',
        carrierName: null,
        serialHmac: 'SERIAL:NEW123',
        salePrice: '110',
        compareAtPrice: '120',
        warrantyDaysOverride: 90,
      }),
      expect.anything(),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({
        action: 'inventory.unit.identifiers.updated',
        metadata: { reason: 'Sửa serial theo biên bản' },
      }),
    );
  });

  it('writes a regular update audit without reason metadata', async () => {
    const fixture = serviceFixture();
    await fixture.service.updateUnit(UNIT_ID, { simConfiguration: 'ESIM_ONLY' }, actor);
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({ action: 'inventory.unit.updated' }),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.not.objectContaining({ metadata: expect.anything() }),
    );
  });
});

describe('InventoryService cost, availability, lifecycle, transfer, and media policy', () => {
  it('projects unknown and known acquisition costs without floating point', async () => {
    const fixture = serviceFixture();
    await expect(fixture.service.getCost(UNIT_ID)).resolves.toEqual({
      acquisitionCost: null,
      additionalCost: '0',
      totalCost: null,
    });
    const known = serviceFixture({
      findUnit: vi.fn(async () =>
        unitRecord({ acquisitionCost: decimal('100'), additionalCost: decimal('20') }),
      ),
    });
    await expect(known.service.getCost(UNIT_ID)).resolves.toEqual({
      acquisitionCost: '100',
      additionalCost: '20',
      totalCost: '120',
    });
    const missing = serviceFixture({ findUnit: vi.fn(async () => null) });
    await expect(missing.service.getCost(UNIT_ID)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('updates nullable cost and audits before/after monetary strings', async () => {
    const fixture = serviceFixture({
      updateUnit: vi.fn(async () =>
        unitRecord({ acquisitionCost: null, additionalCost: decimal('30') }),
      ),
    });
    await expect(
      fixture.service.updateCost(
        UNIT_ID,
        { acquisitionCost: null, additionalCost: '30', reason: 'Điều chỉnh chi phí' },
        actor,
      ),
    ).resolves.toEqual({ acquisitionCost: null, additionalCost: '30', totalCost: null });
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({ action: 'inventory.cost.updated' }),
    );
  });

  it('rejects cost update for a missing unit', async () => {
    const fixture = serviceFixture({ findUnit: vi.fn(async () => null) });
    await expect(
      fixture.service.updateCost(
        UNIT_ID,
        { additionalCost: '0', reason: 'Điều chỉnh chi phí' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it.each([
    { name: 'unit is missing', unit: null, error: 'RESOURCE_NOT_FOUND' },
    { name: 'state is not INSPECTING', unit: unitRecord(), error: 'INVALID_STATE_TRANSITION' },
    {
      name: 'inspection is missing',
      unit: availableCandidate({ inspections: [] }),
      error: 'INVENTORY_INSPECTION_REQUIRED',
    },
    {
      name: 'inspection is not passed',
      unit: availableCandidate({ inspections: [inspectionSummary({ overallResult: 'PARTIAL' })] }),
      error: 'INVENTORY_INSPECTION_REQUIRED',
    },
    {
      name: 'active reservation exists',
      unit: availableCandidate({ _count: { media: 1, reservations: 1 } }),
      error: 'INVENTORY_NOT_AVAILABLE',
    },
    {
      name: 'sale price is missing',
      unit: availableCandidate({ salePrice: null }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
    {
      name: 'location is inactive',
      unit: availableCandidate({ location: locationRecord({ status: 'INACTIVE' }) }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
    {
      name: 'variant is inactive',
      unit: availableCandidate({ variant: variantRecord({ status: 'DRAFT' }) }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
    {
      name: 'product is inactive',
      unit: availableCandidate({
        variant: variantRecord({ product: productRecord({ status: 'DRAFT' }) }),
      }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
    {
      name: 'sellable identifier is missing',
      unit: availableCandidate({ imei1Hmac: null, serialHmac: null }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
    {
      name: 'photo is missing',
      unit: availableCandidate({ _count: { media: 0, reservations: 0 } }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
  ])('rejects make available when $name', async ({ unit, error }) => {
    const fixture = serviceFixture({ findUnit: vi.fn(async () => unit) });
    await expect(fixture.service.makeAvailable(UNIT_ID, actor)).rejects.toMatchObject({
      code: error,
    });
  });

  it('makes an inspected sellable unit available and audits lifecycle only', async () => {
    const existing = availableCandidate();
    const fixture = serviceFixture({
      findUnit: vi.fn(async () => existing),
      updateUnit: vi.fn(async () => unitRecord({ ...existing, lifecycleStatus: 'AVAILABLE' })),
    });
    await expect(fixture.service.makeAvailable(UNIT_ID, actor)).resolves.toMatchObject({
      lifecycleStatus: 'AVAILABLE',
    });
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({ action: 'inventory.unit.made_available' }),
    );
  });

  it('handles named repair/quarantine transitions and rejects invalid source states', async () => {
    const repair = serviceFixture({
      findUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'INSPECTING' })),
      updateUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'REPAIRING' })),
    });
    await expect(
      repair.service.sendToRepair(UNIT_ID, 'Cần thay pin', actor),
    ).resolves.toMatchObject({
      lifecycleStatus: 'REPAIRING',
    });

    const quarantine = serviceFixture({
      findUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'REPAIRING' })),
      updateUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'QUARANTINED' })),
    });
    await expect(
      quarantine.service.quarantine(UNIT_ID, 'Chờ linh kiện', actor),
    ).resolves.toMatchObject({ lifecycleStatus: 'QUARANTINED' });

    const invalid = serviceFixture({
      findUnit: vi.fn(async () => unitRecord({ lifecycleStatus: 'SOLD' })),
    });
    await expect(
      invalid.service.sendToRepair(UNIT_ID, 'Không hợp lệ', actor),
    ).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it.each([
    { name: 'unit is missing', unit: null, role: 'ADMIN' as const, error: 'RESOURCE_NOT_FOUND' },
    {
      name: 'state is terminal',
      unit: unitRecord({ lifecycleStatus: 'SOLD' }),
      role: 'ADMIN' as const,
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'reservation is active',
      unit: unitRecord({ _count: { media: 1, reservations: 1 } }),
      role: 'ADMIN' as const,
      error: 'INVENTORY_NOT_AVAILABLE',
    },
    {
      name: 'employee tries to write off a costed unit',
      unit: unitRecord({ acquisitionCost: decimal('1') }),
      role: 'EMPLOYEE' as const,
      error: 'FORBIDDEN',
    },
  ])('rejects write-off when $name', async ({ unit, role, error }) => {
    const fixture = serviceFixture({ findUnit: vi.fn(async () => unit) });
    await expect(
      fixture.service.writeOff(UNIT_ID, 'Hỏng không thể sửa', actor, role),
    ).rejects.toMatchObject({
      code: error,
    });
  });

  it('allows ADMIN to write off a costed unit and EMPLOYEE to write off a zero-cost unit', async () => {
    for (const [role, existing] of [
      ['ADMIN', unitRecord({ acquisitionCost: decimal('10') })],
      ['EMPLOYEE', unitRecord()],
    ] as const) {
      const fixture = serviceFixture({
        findUnit: vi.fn(async () => existing),
        updateUnit: vi.fn(async () => unitRecord({ ...existing, lifecycleStatus: 'WRITTEN_OFF' })),
      });
      await expect(
        fixture.service.writeOff(UNIT_ID, 'Hỏng không thể sửa', actor, role),
      ).resolves.toMatchObject({ lifecycleStatus: 'WRITTEN_OFF' });
    }
  });

  it.each([
    {
      name: 'unit is missing',
      unit: null,
      location: locationRecord(),
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'unit is terminal',
      unit: unitRecord({ lifecycleStatus: 'IN_TRANSIT' }),
      location: locationRecord(),
      error: 'INVALID_STATE_TRANSITION',
    },
    {
      name: 'unit is reserved',
      unit: unitRecord({ _count: { media: 1, reservations: 1 } }),
      location: locationRecord(),
      error: 'INVENTORY_NOT_AVAILABLE',
    },
    {
      name: 'destination is missing',
      unit: unitRecord(),
      location: null,
      error: 'RESOURCE_NOT_FOUND',
    },
    {
      name: 'destination is inactive',
      unit: unitRecord(),
      location: locationRecord({ status: 'INACTIVE' }),
      error: 'VALIDATION_FAILED',
    },
    {
      name: 'destination is unchanged',
      unit: unitRecord(),
      location: locationRecord({ id: LOCATION_ID }),
      error: 'VALIDATION_FAILED',
    },
  ])('rejects transfer when $name', async ({ unit, location, error }) => {
    const fixture = serviceFixture({
      findUnit: vi.fn(async () => unit),
      transaction: transactionFixture({ transferLocation: location }),
    });
    await expect(
      fixture.service.transfer(
        UNIT_ID,
        { toLocationId: NEXT_LOCATION_ID, reason: 'Chuyển sang kho mới' },
        actor,
      ),
    ).rejects.toMatchObject({ code: error });
  });

  it('transfers to an active new location and conditionally includes the reason', async () => {
    const fixture = serviceFixture({
      transaction: transactionFixture({ transferLocation: locationRecord() }),
      updateUnit: vi.fn(async () => unitRecord({ locationId: NEXT_LOCATION_ID })),
    });
    await expect(
      fixture.service.transfer(
        UNIT_ID,
        { toLocationId: NEXT_LOCATION_ID, reason: 'Chuyển sang kho mới' },
        actor,
      ),
    ).resolves.toMatchObject({ id: UNIT_ID });
    expect(fixture.audit.write).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({
        action: 'inventory.unit.transferred',
        metadata: { reason: 'Chuyển sang kho mới' },
      }),
    );
  });

  it('delegates location listing', async () => {
    const fixture = serviceFixture({ listLocations: vi.fn(async () => [locationRecord()]) });
    await expect(fixture.service.listLocations()).resolves.toEqual([locationRecord()]);
  });

  it.each([
    { name: 'owner unit is missing', method: 'owner', unit: null, error: 'RESOURCE_NOT_FOUND' },
    {
      name: 'owner unit is terminal',
      method: 'owner',
      unit: unitRecord({ lifecycleStatus: 'SOLD' }),
      error: 'INVALID_STATE_TRANSITION',
    },
    { name: 'delete unit is missing', method: 'delete', unit: null, error: 'RESOURCE_NOT_FOUND' },
    {
      name: 'last available photo would be removed',
      method: 'delete',
      unit: unitRecord({ lifecycleStatus: 'AVAILABLE', _count: { media: 1, reservations: 0 } }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
    {
      name: 'last reserved photo would be removed',
      method: 'delete',
      unit: unitRecord({ _count: { media: 1, reservations: 1 } }),
      error: 'INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET',
    },
  ])('enforces media policy when $name', async ({ method, unit, error }) => {
    const fixture = serviceFixture({ findUnit: vi.fn(async () => unit) });
    const action =
      method === 'owner'
        ? fixture.service.assertUnitMediaOwner(UNIT_ID)
        : fixture.service.assertCanDeleteUnitMedia(UNIT_ID, {} as Prisma.TransactionClient);
    await expect(action).rejects.toMatchObject({ code: error });
  });

  it('allows media ownership and deletion when lifecycle requirements remain satisfied', async () => {
    const unit = unitRecord({ _count: { media: 2, reservations: 1 } });
    const fixture = serviceFixture({ findUnit: vi.fn(async () => unit) });
    await expect(fixture.service.assertUnitMediaOwner(UNIT_ID)).resolves.toBe(unit);
    await expect(
      fixture.service.assertCanDeleteUnitMedia(UNIT_ID, {} as Prisma.TransactionClient),
    ).resolves.toBe(unit);
  });
});

function serviceFixture(overrides: Record<string, unknown> = {}) {
  const transaction =
    (overrides['transaction'] as Prisma.TransactionClient | undefined) ?? transactionFixture();
  const repository = {
    listUnits: vi.fn(async () => ({ items: [unitRecord()], totalItems: 1 })),
    findUnit: vi.fn(async () => unitRecord()),
    findByIdentifier: vi.fn(async () => unitRecord()),
    createUnit: vi.fn(async () => unitRecord()),
    updateUnit: vi.fn(async (_id: string, data: Record<string, unknown>) => unitRecord(data)),
    listLocations: vi.fn(async () => [locationRecord()]),
    lockIdentifierKeys: vi.fn(async () => undefined),
    findDuplicateIdentifier: vi.fn(async () => null),
    ...withoutFixtureOnlyOverrides(overrides),
  } as unknown as InventoryRepository;
  const identifiers = {
    protect: vi.fn((type: 'IMEI' | 'SERIAL' | 'EID', value: string) =>
      protectedIdentifier(`${type}:${value}`),
    ),
    lookupHmac: vi.fn((type: string, value: string) => `${type}:${value}`),
    decrypt: vi.fn(
      (encrypted: string, keyVersion: number) => `plain:${encrypted}:${keyVersion.toString()}`,
    ),
    ...(overrides['protect'] === undefined ? {} : { protect: overrides['protect'] }),
    ...(overrides['lookupHmac'] === undefined ? {} : { lookupHmac: overrides['lookupHmac'] }),
    ...(overrides['decrypt'] === undefined ? {} : { decrypt: overrides['decrypt'] }),
  } as unknown as IdentifierProtectionService;
  const transactions = {
    run: vi.fn(
      async <T>(_operation: string, work: (client: Prisma.TransactionClient) => Promise<T>) =>
        work(transaction),
    ),
  } as unknown as SerializableTransactionRunner;
  const audit = { write: vi.fn(async () => undefined) } as unknown as AuditWriter;
  return {
    service: new InventoryService(repository, identifiers, transactions, audit),
    repository,
    identifiers,
    audit,
  };
}

function withoutFixtureOnlyOverrides(overrides: Record<string, unknown>) {
  const result = { ...overrides };
  delete result['transaction'];
  delete result['protect'];
  delete result['lookupHmac'];
  delete result['decrypt'];
  return result;
}

function transactionFixture(
  overrides: {
    variant?: ReturnType<typeof variantRecord> | null;
    location?: ReturnType<typeof locationRecord> | null;
    transferLocation?: ReturnType<typeof locationRecord> | null;
  } = {},
): Prisma.TransactionClient {
  const hasVariant = Object.prototype.hasOwnProperty.call(overrides, 'variant');
  const hasLocation = Object.prototype.hasOwnProperty.call(overrides, 'location');
  const hasTransferLocation = Object.prototype.hasOwnProperty.call(overrides, 'transferLocation');
  return {
    productVariant: {
      findUnique: vi.fn(async () => (hasVariant ? overrides.variant : variantRecord())),
    },
    inventoryLocation: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === NEXT_LOCATION_ID && hasTransferLocation) return overrides.transferLocation;
        return hasLocation ? overrides.location : locationRecord({ id: where.id });
      }),
    },
  } as unknown as Prisma.TransactionClient;
}

function intakeInput(overrides: Record<string, unknown> = {}) {
  return {
    variantId: VARIANT_ID,
    locationId: LOCATION_ID,
    simLockStatus: 'UNLOCKED' as const,
    simConfiguration: 'PHYSICAL_AND_ESIM' as const,
    salePrice: '100',
    compareAtPrice: '120',
    ...overrides,
  };
}

function unitRecord(overrides: Record<string, unknown> = {}): InventoryUnitRecord {
  const now = new Date('2026-08-25T08:00:00.000Z');
  return {
    id: UNIT_ID,
    variantId: VARIANT_ID,
    locationId: LOCATION_ID,
    inventoryCode: 'RPH-U-ABCDEFGH',
    modelNumber: null,
    regionCode: null,
    simLockStatus: 'UNLOCKED',
    carrierName: null,
    simConfiguration: 'PHYSICAL_AND_ESIM',
    imei1Encrypted: null,
    imei1Hmac: 'IMEI:base',
    imei1Suffix: null,
    imei2Encrypted: null,
    imei2Hmac: null,
    imei2Suffix: null,
    serialEncrypted: null,
    serialHmac: null,
    serialSuffix: null,
    eidEncrypted: null,
    eidHmac: null,
    eidSuffix: null,
    identifierKeyVersion: 1,
    lifecycleStatus: 'RECEIVED',
    acquisitionCost: null,
    additionalCost: decimal('0'),
    salePrice: decimal('100'),
    compareAtPrice: decimal('120'),
    warrantyDaysOverride: null,
    receivedAt: now,
    soldAt: null,
    createdAt: now,
    updatedAt: now,
    variant: variantRecord(),
    location: locationRecord({ id: LOCATION_ID }),
    inspections: [],
    _count: { media: 1, reservations: 0 },
    ...overrides,
  } as unknown as InventoryUnitRecord;
}

function availableCandidate(overrides: Record<string, unknown> = {}): InventoryUnitRecord {
  return unitRecord({
    lifecycleStatus: 'INSPECTING',
    salePrice: decimal('100'),
    imei1Hmac: 'IMEI:sellable',
    inspections: [inspectionSummary()],
    _count: { media: 1, reservations: 0 },
    ...overrides,
  });
}

function variantRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: 'IPHONE-TEST',
    displayName: 'iPhone Test',
    status: 'ACTIVE' as const,
    inventoryMode: 'SERIALIZED' as const,
    product: productRecord(),
    ...overrides,
  };
}

function productRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: 'iPhone Test',
    slug: 'iphone-test',
    type: 'IPHONE' as const,
    status: 'ACTIVE' as const,
    ...overrides,
  };
}

function locationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: NEXT_LOCATION_ID,
    code: 'HCM-WH-01',
    name: 'Kho HCM',
    type: 'WAREHOUSE' as const,
    status: 'ACTIVE' as const,
    ...overrides,
  };
}

function inspectionSummary(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-08-25T08:00:00.000Z');
  return {
    id: id(7),
    overallResult: 'PASSED' as const,
    conditionGrade: 'A' as const,
    batteryHealthPercent: 95,
    inspectedAt: now,
    status: 'COMPLETED' as const,
    ...overrides,
  };
}

function protectedIdentifier(seed: string): ProtectedIdentifier {
  return { encrypted: `enc:${seed}`, hmac: seed, suffix: seed.slice(-4), keyVersion: 1 };
}

function decimal(value: string) {
  return { toString: () => value };
}

function id(suffix: number): string {
  return `0198e5b0-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;
}
