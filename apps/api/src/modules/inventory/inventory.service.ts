import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { InventoryLifecycleStatus, Prisma, UserRole } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type {
  IdentifierLookupDto,
  IntakeInventoryUnitDto,
  InventoryReasonDto,
  InventoryUnitListQueryDto,
  UpdateInventoryCostDto,
  UpdateInventoryUnitDto,
  TransferInventoryUnitDto,
} from './inventory.dto.js';
import {
  IdentifierValidationError,
  maskIdentifier,
  type IdentifierType,
  type ProtectedIdentifier,
} from './identifier-protection.js';
import { IdentifierProtectionService } from './identifier-protection.service.js';
import {
  InventoryRepository,
  type IdentifierKey,
  type InventoryUnitListRecord,
  type InventoryUnitRecord,
} from './inventory.repository.js';
import type {
  AvailabilityReadinessReason,
  DecryptedIdentifiersDto,
  InventoryCostDto,
  InventoryUnitAction,
  InventoryUnitDetailDto,
  InventoryUnitListItemDto,
} from './inventory-response.dto.js';

const INVENTORY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

interface ProtectedInput {
  imei1?: ProtectedIdentifier;
  imei2?: ProtectedIdentifier;
  serial?: ProtectedIdentifier;
  eid?: ProtectedIdentifier;
}

interface ProtectedData {
  imei1Encrypted?: string;
  imei1Hmac?: string;
  imei1Suffix?: string;
  imei2Encrypted?: string;
  imei2Hmac?: string;
  imei2Suffix?: string;
  serialEncrypted?: string;
  serialHmac?: string;
  serialSuffix?: string;
  eidEncrypted?: string;
  eidHmac?: string;
  eidSuffix?: string;
}

@Injectable()
export class InventoryService {
  public constructor(
    @Inject(InventoryRepository) private readonly repository: InventoryRepository,
    @Inject(IdentifierProtectionService)
    private readonly identifiers: IdentifierProtectionService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async listUnits(query: InventoryUnitListQueryDto) {
    const result = await this.repository.listUnits(query);
    return new PaginatedApiResult(result.items.map(toListItem), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    });
  }

  public async getUnit(id: string, role: UserRole = 'EMPLOYEE'): Promise<InventoryUnitDetailDto> {
    const unit = await this.repository.findUnit(id);
    if (unit === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const hasActiveTransferTarget = await this.repository.hasActiveTransferTarget(unit.locationId);
    return toDetail(unit, this.config, role, hasActiveTransferTarget);
  }

  public async intake(
    input: IntakeInventoryUnitDto,
    actor: AuditActorContext,
  ): Promise<InventoryUnitDetailDto> {
    assertCarrier(input.simLockStatus, input.carrierName);
    assertPricePair(input.salePrice, input.compareAtPrice);
    const protectedInput = this.protectInput(input);
    assertDistinctImeis(protectedInput.imei1?.hmac, protectedInput.imei2?.hmac);
    try {
      const unit = await this.transactions.run('inventory.unit.intake', async (transaction) => {
        const variant = await transaction.productVariant.findUnique({
          where: { id: input.variantId },
          include: { product: true },
        });
        const location = await transaction.inventoryLocation.findUnique({
          where: { id: input.locationId },
        });
        if (variant === null || location === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (
          variant.product.type !== 'IPHONE' ||
          variant.inventoryMode !== 'SERIALIZED' ||
          variant.status === 'ARCHIVED' ||
          variant.product.status === 'ARCHIVED' ||
          location.status !== 'ACTIVE'
        ) {
          throw validation('variantId', 'INVALID_INTAKE_TARGET');
        }
        const keys = identifierKeys(protectedInput);
        await this.repository.lockIdentifierKeys(keys, transaction);
        if (
          (await this.repository.findDuplicateIdentifier(keys, undefined, transaction)) !== null
        ) {
          throw new ApiError('DUPLICATE_RESOURCE');
        }
        const created = await this.repository.createUnit(
          {
            variantId: variant.id,
            locationId: location.id,
            inventoryCode: generateInventoryCode(),
            ...(input.modelNumber === undefined
              ? {}
              : { modelNumber: normalizeUpper(input.modelNumber) }),
            ...(input.regionCode === undefined
              ? {}
              : { regionCode: normalizeUpper(input.regionCode) }),
            simLockStatus: input.simLockStatus,
            carrierName: input.simLockStatus === 'UNLOCKED' ? null : (input.carrierName ?? null),
            simConfiguration: input.simConfiguration,
            ...protectedData(protectedInput),
            identifierKeyVersion: 1,
            lifecycleStatus: 'RECEIVED',
            ...(input.salePrice === undefined ? {} : { salePrice: input.salePrice }),
            ...(input.compareAtPrice === undefined ? {} : { compareAtPrice: input.compareAtPrice }),
            ...(input.warrantyDaysOverride === undefined
              ? {}
              : { warrantyDaysOverride: input.warrantyDaysOverride }),
          },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'inventory.unit.intake.created',
          resourceType: 'InventoryUnit',
          resourceId: created.id,
          changes: {
            after: {
              inventoryCode: created.inventoryCode,
              lifecycleStatus: created.lifecycleStatus,
              variantId: created.variantId,
              locationId: created.locationId,
              identifierTypes: keys.map((key) => key.type),
            },
          },
        });
        return created;
      });
      return toDetail(unit, this.config);
    } catch (error) {
      mapPersistenceError(error);
    }
  }

  public async updateUnit(
    id: string,
    input: UpdateInventoryUnitDto,
    actor: AuditActorContext,
  ): Promise<InventoryUnitDetailDto> {
    const protectedInput = this.protectInput(input);
    try {
      const unit = await this.transactions.run('inventory.unit.update', async (transaction) => {
        const existing = await this.repository.findUnit(id, transaction);
        if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
        const hasIdentifierChange = identifierKeys(protectedInput).length > 0;
        if (
          hasIdentifierChange &&
          ['IN_TRANSIT', 'SOLD', 'WRITTEN_OFF'].includes(existing.lifecycleStatus)
        ) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        if (
          hasIdentifierChange &&
          existing.lifecycleStatus === 'AVAILABLE' &&
          input.reason === undefined
        ) {
          throw validation('reason', 'IDENTIFIER_CORRECTION_REASON_REQUIRED');
        }
        if (
          (input.salePrice !== undefined || input.compareAtPrice !== undefined) &&
          ['SOLD', 'WRITTEN_OFF'].includes(existing.lifecycleStatus)
        ) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        const nextLock = input.simLockStatus ?? existing.simLockStatus;
        const nextCarrier =
          input.carrierName === undefined ? existing.carrierName : input.carrierName;
        assertCarrier(nextLock, nextCarrier);
        const nextSale = input.salePrice ?? existing.salePrice?.toString();
        const nextCompare = input.compareAtPrice ?? existing.compareAtPrice?.toString();
        assertPricePair(nextSale, nextCompare);
        assertDistinctImeis(
          protectedInput.imei1?.hmac ?? existing.imei1Hmac ?? undefined,
          protectedInput.imei2?.hmac ?? existing.imei2Hmac ?? undefined,
        );
        const keys = identifierKeys(protectedInput);
        await this.repository.lockIdentifierKeys(keys, transaction);
        if ((await this.repository.findDuplicateIdentifier(keys, id, transaction)) !== null) {
          throw new ApiError('DUPLICATE_RESOURCE');
        }
        const updated = await this.repository.updateUnit(
          id,
          {
            ...(input.modelNumber === undefined
              ? {}
              : { modelNumber: normalizeUpper(input.modelNumber) }),
            ...(input.regionCode === undefined
              ? {}
              : { regionCode: normalizeUpper(input.regionCode) }),
            ...(input.simLockStatus === undefined ? {} : { simLockStatus: input.simLockStatus }),
            ...(input.carrierName === undefined
              ? input.simLockStatus === 'UNLOCKED'
                ? { carrierName: null }
                : {}
              : { carrierName: input.carrierName }),
            ...(input.simConfiguration === undefined
              ? {}
              : { simConfiguration: input.simConfiguration }),
            ...protectedData(protectedInput),
            ...(input.salePrice === undefined ? {} : { salePrice: input.salePrice }),
            ...(input.compareAtPrice === undefined ? {} : { compareAtPrice: input.compareAtPrice }),
            ...(input.warrantyDaysOverride === undefined
              ? {}
              : { warrantyDaysOverride: input.warrantyDaysOverride }),
          },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: hasIdentifierChange
            ? 'inventory.unit.identifiers.updated'
            : 'inventory.unit.updated',
          resourceType: 'InventoryUnit',
          resourceId: id,
          changes: {
            before: safeUnitDelta(existing),
            after: safeUnitDelta(updated),
          },
          ...(input.reason === undefined ? {} : { metadata: { reason: input.reason } }),
        });
        return updated;
      });
      return toDetail(unit, this.config);
    } catch (error) {
      mapPersistenceError(error);
    }
  }

  public async lookupIdentifier(
    input: IdentifierLookupDto,
    actor: AuditActorContext,
  ): Promise<InventoryUnitListItemDto> {
    let hmac: string;
    try {
      hmac = this.identifiers.lookupHmac(input.type, input.value);
    } catch (error) {
      mapIdentifierError(error, 'value');
    }
    const unit = await this.transactions.run('inventory.identifier.lookup', async (transaction) => {
      const found = await this.repository.findByIdentifier(input.type, hmac, transaction);
      if (found === null) throw new ApiError('RESOURCE_NOT_FOUND');
      await this.audit.write(transaction, actor, {
        action: 'inventory.identifier.lookup',
        resourceType: 'InventoryUnit',
        resourceId: found.id,
        metadata: { reason: input.reason, identifierType: input.type },
      });
      return found;
    });
    return toListItem(unit);
  }

  public async revealIdentifiers(
    id: string,
    input: InventoryReasonDto,
    actor: AuditActorContext,
  ): Promise<DecryptedIdentifiersDto> {
    return this.transactions.run('inventory.identifier.reveal', async (transaction) => {
      const unit = await this.repository.findUnit(id, transaction);
      if (unit === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const decrypted = {
        imei1: decryptNullable(this.identifiers, unit.imei1Encrypted, unit.identifierKeyVersion),
        imei2: decryptNullable(this.identifiers, unit.imei2Encrypted, unit.identifierKeyVersion),
        serial: decryptNullable(this.identifiers, unit.serialEncrypted, unit.identifierKeyVersion),
        eid: decryptNullable(this.identifiers, unit.eidEncrypted, unit.identifierKeyVersion),
      };
      await this.audit.write(transaction, actor, {
        action: 'inventory.identifier.reveal',
        resourceType: 'InventoryUnit',
        resourceId: id,
        metadata: { reason: input.reason, identifierTypes: presentIdentifierTypes(unit) },
      });
      return decrypted;
    });
  }

  public async getCost(id: string): Promise<InventoryCostDto> {
    const unit = await this.repository.findUnit(id);
    if (unit === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return toCost(unit);
  }

  public async updateCost(
    id: string,
    input: UpdateInventoryCostDto,
    actor: AuditActorContext,
  ): Promise<InventoryCostDto> {
    const unit = await this.transactions.run('inventory.cost.update', async (transaction) => {
      const existing = await this.repository.findUnit(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const updated = await this.repository.updateUnit(
        id,
        {
          acquisitionCost: input.acquisitionCost ?? null,
          additionalCost: input.additionalCost,
        },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'inventory.cost.updated',
        resourceType: 'InventoryUnit',
        resourceId: id,
        changes: { before: costDelta(existing), after: costDelta(updated) },
        metadata: { reason: input.reason },
      });
      return updated;
    });
    return toCost(unit);
  }

  public async makeAvailable(id: string, actor: AuditActorContext) {
    const unit = await this.transactions.run(
      'inventory.unit.make-available',
      async (transaction) => {
        const existing = await this.repository.findUnit(id, transaction);
        if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (existing.lifecycleStatus !== 'INSPECTING') {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        const inspection = existing.inspections[0];
        if (
          inspection === undefined ||
          inspection.status !== 'COMPLETED' ||
          inspection.overallResult !== 'PASSED'
        ) {
          throw new ApiError('INVENTORY_INSPECTION_REQUIRED');
        }
        if (existing._count.reservations > 0) throw new ApiError('INVENTORY_NOT_AVAILABLE');
        const hasSellableIdentifier = existing.imei1Hmac !== null || existing.serialHmac !== null;
        if (
          existing.salePrice === null ||
          existing.location.status !== 'ACTIVE' ||
          existing.variant.status !== 'ACTIVE' ||
          existing.variant.product.status !== 'ACTIVE' ||
          !hasSellableIdentifier ||
          existing._count.media < 1
        ) {
          throw new ApiError('INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET');
        }
        const updated = await this.repository.updateUnit(
          id,
          { lifecycleStatus: 'AVAILABLE' },
          transaction,
        );
        await this.auditLifecycle(transaction, actor, existing, updated, 'made_available');
        return updated;
      },
    );
    return toDetail(unit, this.config);
  }

  public sendToRepair(id: string, reason: string, actor: AuditActorContext) {
    return this.transition(
      id,
      ['INSPECTING', 'QUARANTINED'],
      'REPAIRING',
      'sent_to_repair',
      reason,
      actor,
    );
  }

  public quarantine(id: string, reason: string, actor: AuditActorContext) {
    return this.transition(
      id,
      ['RECEIVED', 'INSPECTING', 'REPAIRING'],
      'QUARANTINED',
      'quarantined',
      reason,
      actor,
    );
  }

  public async writeOff(id: string, reason: string, actor: AuditActorContext, role: UserRole) {
    const unit = await this.transactions.run('inventory.unit.write-off', async (transaction) => {
      const existing = await this.repository.findUnit(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (
        !['RECEIVED', 'INSPECTING', 'AVAILABLE', 'REPAIRING', 'QUARANTINED'].includes(
          existing.lifecycleStatus,
        )
      ) {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      if (existing._count.reservations > 0) throw new ApiError('INVENTORY_NOT_AVAILABLE');
      const hasCost =
        existing.acquisitionCost !== null || existing.additionalCost.toString() !== '0';
      if (hasCost && role !== 'ADMIN') throw new ApiError('FORBIDDEN');
      const updated = await this.repository.updateUnit(
        id,
        { lifecycleStatus: 'WRITTEN_OFF' },
        transaction,
      );
      await this.auditLifecycle(transaction, actor, existing, updated, 'written_off', reason);
      return updated;
    });
    return toDetail(unit, this.config, role);
  }

  public async transfer(id: string, input: TransferInventoryUnitDto, actor: AuditActorContext) {
    const unit = await this.transactions.run('inventory.unit.transfer', async (transaction) => {
      const existing = await this.repository.findUnit(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (['IN_TRANSIT', 'SOLD', 'WRITTEN_OFF'].includes(existing.lifecycleStatus)) {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      if (existing._count.reservations > 0) throw new ApiError('INVENTORY_NOT_AVAILABLE');
      const location = await transaction.inventoryLocation.findUnique({
        where: { id: input.toLocationId },
      });
      if (location === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (location.status !== 'ACTIVE' || location.id === existing.locationId) {
        throw validation('toLocationId', 'INVALID_TRANSFER_LOCATION');
      }
      const updated = await this.repository.updateUnit(
        id,
        { locationId: location.id },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'inventory.unit.transferred',
        resourceType: 'InventoryUnit',
        resourceId: id,
        changes: {
          before: { locationId: existing.locationId },
          after: { locationId: updated.locationId },
        },
        ...(input.reason === undefined ? {} : { metadata: { reason: input.reason } }),
      });
      return updated;
    });
    return toDetail(unit, this.config);
  }

  public listLocations() {
    return this.repository.listLocations();
  }

  private async transition(
    id: string,
    allowedSources: InventoryLifecycleStatus[],
    target: InventoryLifecycleStatus,
    action: string,
    reason: string,
    actor: AuditActorContext,
  ) {
    const unit = await this.transactions.run(`inventory.unit.${action}`, async (transaction) => {
      const existing = await this.repository.findUnit(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (!allowedSources.includes(existing.lifecycleStatus)) {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      const updated = await this.repository.updateUnit(
        id,
        { lifecycleStatus: target },
        transaction,
      );
      await this.auditLifecycle(transaction, actor, existing, updated, action, reason);
      return updated;
    });
    return toDetail(unit, this.config);
  }

  private auditLifecycle(
    transaction: Prisma.TransactionClient,
    actor: AuditActorContext,
    before: InventoryUnitRecord,
    after: InventoryUnitRecord,
    action: string,
    reason?: string,
  ) {
    return this.audit.write(transaction, actor, {
      action: `inventory.unit.${action}`,
      resourceType: 'InventoryUnit',
      resourceId: before.id,
      changes: {
        before: { lifecycleStatus: before.lifecycleStatus },
        after: { lifecycleStatus: after.lifecycleStatus },
      },
      ...(reason === undefined ? {} : { metadata: { reason } }),
    });
  }

  public async assertUnitMediaOwner(id: string, transaction?: Prisma.TransactionClient) {
    const unit = await this.repository.findUnit(id, transaction);
    if (unit === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (['SOLD', 'WRITTEN_OFF'].includes(unit.lifecycleStatus)) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    return unit;
  }

  public async assertCanDeleteUnitMedia(id: string, transaction: Prisma.TransactionClient) {
    const unit = await this.repository.findUnit(id, transaction);
    if (unit === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (
      (unit.lifecycleStatus === 'AVAILABLE' || unit._count.reservations > 0) &&
      unit._count.media <= 1
    ) {
      throw new ApiError('INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET');
    }
    return unit;
  }

  private protectInput(input: {
    imei1?: string;
    imei2?: string;
    serial?: string;
    eid?: string;
  }): ProtectedInput {
    try {
      return {
        ...(input.imei1 === undefined
          ? {}
          : { imei1: this.identifiers.protect('IMEI', input.imei1) }),
        ...(input.imei2 === undefined
          ? {}
          : { imei2: this.identifiers.protect('IMEI', input.imei2) }),
        ...(input.serial === undefined
          ? {}
          : { serial: this.identifiers.protect('SERIAL', input.serial) }),
        ...(input.eid === undefined ? {} : { eid: this.identifiers.protect('EID', input.eid) }),
      };
    } catch (error) {
      mapIdentifierError(error, 'identifiers');
    }
  }
}

function protectedData(input: ProtectedInput): ProtectedData {
  return {
    ...(input.imei1 === undefined
      ? {}
      : {
          imei1Encrypted: input.imei1.encrypted,
          imei1Hmac: input.imei1.hmac,
          imei1Suffix: input.imei1.suffix,
        }),
    ...(input.imei2 === undefined
      ? {}
      : {
          imei2Encrypted: input.imei2.encrypted,
          imei2Hmac: input.imei2.hmac,
          imei2Suffix: input.imei2.suffix,
        }),
    ...(input.serial === undefined
      ? {}
      : {
          serialEncrypted: input.serial.encrypted,
          serialHmac: input.serial.hmac,
          serialSuffix: input.serial.suffix,
        }),
    ...(input.eid === undefined
      ? {}
      : {
          eidEncrypted: input.eid.encrypted,
          eidHmac: input.eid.hmac,
          eidSuffix: input.eid.suffix,
        }),
  };
}

function identifierKeys(input: ProtectedInput): IdentifierKey[] {
  return [
    ...(input.imei1 === undefined ? [] : [{ type: 'IMEI' as const, hmac: input.imei1.hmac }]),
    ...(input.imei2 === undefined ? [] : [{ type: 'IMEI' as const, hmac: input.imei2.hmac }]),
    ...(input.serial === undefined ? [] : [{ type: 'SERIAL' as const, hmac: input.serial.hmac }]),
    ...(input.eid === undefined ? [] : [{ type: 'EID' as const, hmac: input.eid.hmac }]),
  ];
}

function toListItem(unit: InventoryUnitListRecord | InventoryUnitRecord): InventoryUnitListItemDto {
  const current = unit.inspections[0];
  return {
    id: unit.id,
    inventoryCode: unit.inventoryCode,
    lifecycleStatus: unit.lifecycleStatus,
    product: {
      id: unit.variant.product.id,
      name: unit.variant.product.name,
      slug: unit.variant.product.slug,
      status: unit.variant.product.status,
    },
    variant: {
      id: unit.variant.id,
      sku: unit.variant.sku,
      displayName: unit.variant.displayName,
      status: unit.variant.status,
    },
    location: {
      id: unit.location.id,
      code: unit.location.code,
      name: unit.location.name,
      type: unit.location.type,
      status: unit.location.status,
    },
    salePrice: unit.salePrice?.toString() ?? null,
    compareAtPrice: unit.compareAtPrice?.toString() ?? null,
    simLockStatus: unit.simLockStatus,
    maskedIdentifiers: maskedIdentifiers(unit),
    currentInspection:
      current === undefined
        ? null
        : {
            id: current.id,
            overallResult: current.overallResult,
            conditionGrade: current.conditionGrade,
            batteryHealthPercent: current.batteryHealthPercent,
            inspectedAt: current.inspectedAt,
          },
    activeReservationCount: unit._count.reservations,
    mediaCount: unit._count.media,
    receivedAt: unit.receivedAt,
    updatedAt: unit.updatedAt,
  };
}

function toDetail(
  unit: InventoryUnitRecord,
  config: AppConfig,
  role: UserRole = 'EMPLOYEE',
  hasActiveTransferTarget = true,
): InventoryUnitDetailDto {
  const listItem = toListItem(unit);
  const readinessReasons = availabilityReadinessReasons(unit);
  return {
    id: listItem.id,
    inventoryCode: listItem.inventoryCode,
    lifecycleStatus: listItem.lifecycleStatus,
    product: listItem.product,
    variant: listItem.variant,
    location: listItem.location,
    salePrice: listItem.salePrice,
    compareAtPrice: listItem.compareAtPrice,
    simLockStatus: listItem.simLockStatus,
    maskedIdentifiers: listItem.maskedIdentifiers,
    currentInspection: listItem.currentInspection,
    activeReservationCount: listItem.activeReservationCount,
    mediaCount: listItem.mediaCount,
    receivedAt: listItem.receivedAt,
    updatedAt: listItem.updatedAt,
    modelNumber: unit.modelNumber,
    regionCode: unit.regionCode,
    carrierName: unit.carrierName,
    simConfiguration: unit.simConfiguration,
    warrantyDaysOverride: unit.warrantyDaysOverride,
    media: unit.media.map((media) => ({
      id: media.id,
      url: publicMediaUrl(config, media.bucket, media.objectPath),
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      width: media.width ?? 0,
      height: media.height ?? 0,
      sortOrder: media.sortOrder,
      altText: media.altText,
      createdAt: media.createdAt,
    })),
    availableActions: availableActions(unit, readinessReasons, role, hasActiveTransferTarget),
    availabilityReadiness: {
      isReady: readinessReasons.length === 0,
      reasons: readinessReasons,
    },
  };
}

function availabilityReadinessReasons(unit: InventoryUnitRecord): AvailabilityReadinessReason[] {
  const reasons: AvailabilityReadinessReason[] = [];
  const inspection = unit.inspections[0];
  if (unit.lifecycleStatus !== 'INSPECTING') reasons.push('STATUS_NOT_INSPECTING');
  if (inspection === undefined) reasons.push('INSPECTION_REQUIRED');
  else if (inspection.overallResult !== 'PASSED') reasons.push('INSPECTION_NOT_PASSED');
  if (unit._count.reservations > 0) reasons.push('ACTIVE_RESERVATION');
  if (unit.salePrice === null) reasons.push('SALE_PRICE_REQUIRED');
  if (unit.location.status !== 'ACTIVE') reasons.push('LOCATION_INACTIVE');
  if (unit.variant.status !== 'ACTIVE') reasons.push('VARIANT_INACTIVE');
  if (unit.variant.product.status !== 'ACTIVE') reasons.push('PRODUCT_INACTIVE');
  if (unit.imei1Hmac === null && unit.serialHmac === null) reasons.push('IDENTIFIER_REQUIRED');
  if (unit._count.media < 1) reasons.push('MEDIA_REQUIRED');
  return reasons;
}

function availableActions(
  unit: InventoryUnitRecord,
  readinessReasons: AvailabilityReadinessReason[],
  role: UserRole,
  hasActiveTransferTarget: boolean,
): InventoryUnitAction[] {
  const actions: InventoryUnitAction[] = [];
  const hasActiveReservation = unit._count.reservations > 0;
  const canInspect =
    unit.variant.product.type === 'IPHONE' &&
    unit.variant.inventoryMode === 'SERIALIZED' &&
    ['RECEIVED', 'AVAILABLE', 'REPAIRING', 'QUARANTINED', 'INSPECTING'].includes(
      unit.lifecycleStatus,
    ) &&
    !(unit.lifecycleStatus === 'AVAILABLE' && hasActiveReservation) &&
    unit._count.inspections === 0;
  if (canInspect) actions.push('CREATE_INSPECTION');
  if (readinessReasons.length === 0) actions.push('MAKE_AVAILABLE');
  if (['INSPECTING', 'QUARANTINED'].includes(unit.lifecycleStatus)) {
    actions.push('SEND_TO_REPAIR');
  }
  if (['RECEIVED', 'INSPECTING', 'REPAIRING'].includes(unit.lifecycleStatus)) {
    actions.push('QUARANTINE');
  }
  const hasCost = unit.acquisitionCost !== null || unit.additionalCost.toString() !== '0';
  if (
    ['RECEIVED', 'INSPECTING', 'AVAILABLE', 'REPAIRING', 'QUARANTINED'].includes(
      unit.lifecycleStatus,
    ) &&
    !hasActiveReservation &&
    (!hasCost || role === 'ADMIN')
  ) {
    actions.push('WRITE_OFF');
  }
  if (
    !['IN_TRANSIT', 'SOLD', 'WRITTEN_OFF'].includes(unit.lifecycleStatus) &&
    !hasActiveReservation &&
    hasActiveTransferTarget
  ) {
    actions.push('TRANSFER');
  }
  if (!['SOLD', 'WRITTEN_OFF'].includes(unit.lifecycleStatus)) actions.push('UPLOAD_MEDIA');
  return actions;
}

function publicMediaUrl(config: AppConfig, bucket: string, objectPath: string): string {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${config.storage.url.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function maskedIdentifiers(
  unit: Pick<InventoryUnitListRecord, 'imei1Suffix' | 'imei2Suffix' | 'serialSuffix' | 'eidSuffix'>,
) {
  return [
    ...(unit.imei1Suffix === null
      ? []
      : [{ type: 'IMEI_1' as const, maskedValue: maskIdentifier(unit.imei1Suffix) }]),
    ...(unit.imei2Suffix === null
      ? []
      : [{ type: 'IMEI_2' as const, maskedValue: maskIdentifier(unit.imei2Suffix) }]),
    ...(unit.serialSuffix === null
      ? []
      : [{ type: 'SERIAL' as const, maskedValue: maskIdentifier(unit.serialSuffix) }]),
    ...(unit.eidSuffix === null
      ? []
      : [{ type: 'EID' as const, maskedValue: maskIdentifier(unit.eidSuffix) }]),
  ];
}

function toCost(
  unit: Pick<InventoryUnitRecord, 'acquisitionCost' | 'additionalCost'>,
): InventoryCostDto {
  const acquisitionCost = unit.acquisitionCost?.toString() ?? null;
  const additionalCost = unit.additionalCost.toString();
  return {
    acquisitionCost,
    additionalCost,
    totalCost:
      acquisitionCost === null
        ? null
        : (BigInt(acquisitionCost) + BigInt(additionalCost)).toString(),
  };
}

function assertCarrier(
  status: 'UNLOCKED' | 'CARRIER_LOCKED' | 'UNKNOWN',
  carrierName: string | null | undefined,
): void {
  if (status === 'CARRIER_LOCKED' && !carrierName?.trim()) {
    throw validation('carrierName', 'CARRIER_REQUIRED');
  }
  if (status === 'UNLOCKED' && carrierName !== undefined && carrierName !== null) {
    throw validation('carrierName', 'CARRIER_FORBIDDEN');
  }
}

function assertPricePair(salePrice?: string, compareAtPrice?: string): void {
  if (
    salePrice !== undefined &&
    compareAtPrice !== undefined &&
    BigInt(compareAtPrice) < BigInt(salePrice)
  ) {
    throw validation('compareAtPrice', 'COMPARE_AT_PRICE_TOO_LOW');
  }
}

function assertDistinctImeis(imei1Hmac?: string, imei2Hmac?: string): void {
  if (imei1Hmac !== undefined && imei1Hmac === imei2Hmac) {
    throw validation('imei2', 'IMEI_SLOTS_MUST_DIFFER');
  }
}

function normalizeUpper(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function generateInventoryCode(): string {
  const bytes = randomBytes(8);
  let suffix = '';
  for (const byte of bytes) {
    suffix += INVENTORY_CODE_ALPHABET.charAt(byte % INVENTORY_CODE_ALPHABET.length);
  }
  return `RPH-U-${suffix}`;
}

function decryptNullable(
  codec: IdentifierProtectionService,
  encrypted: string | null,
  keyVersion: number,
): string | null {
  return encrypted === null ? null : codec.decrypt(encrypted, keyVersion);
}

function safeUnitDelta(unit: InventoryUnitRecord): Prisma.InputJsonObject {
  return {
    lifecycleStatus: unit.lifecycleStatus,
    locationId: unit.locationId,
    salePrice: unit.salePrice?.toString() ?? null,
    compareAtPrice: unit.compareAtPrice?.toString() ?? null,
    modelNumber: unit.modelNumber,
    regionCode: unit.regionCode,
    simLockStatus: unit.simLockStatus,
    simConfiguration: unit.simConfiguration,
    identifierTypes: presentIdentifierTypes(unit),
  };
}

function costDelta(
  unit: Pick<InventoryUnitRecord, 'acquisitionCost' | 'additionalCost'>,
): Prisma.InputJsonObject {
  return {
    acquisitionCost: unit.acquisitionCost?.toString() ?? null,
    additionalCost: unit.additionalCost.toString(),
  };
}

function presentIdentifierTypes(unit: InventoryUnitRecord): IdentifierType[] {
  return [
    ...(unit.imei1Encrypted === null && unit.imei2Encrypted === null ? [] : ['IMEI' as const]),
    ...(unit.serialEncrypted === null ? [] : ['SERIAL' as const]),
    ...(unit.eidEncrypted === null ? [] : ['EID' as const]),
  ];
}

function validation(field: string, code: string): ApiError {
  return new ApiError('VALIDATION_FAILED', undefined, [{ field, code, message: code }]);
}

function mapIdentifierError(error: unknown, field: string): never {
  if (error instanceof IdentifierValidationError) {
    throw validation(field, `INVALID_${error.identifierType}`);
  }
  throw error;
}

function mapPersistenceError(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    throw new ApiError('DUPLICATE_RESOURCE');
  }
  throw error;
}
