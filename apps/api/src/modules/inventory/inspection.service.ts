import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import {
  inspectionResult,
  InspectionChecklistError,
  validateInspectionChecklist,
} from '../../common/domain/iphone-inspection-checklist.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type {
  CreateInspectionDto,
  InspectionListQueryDto,
  UpdateInspectionDto,
} from './inventory.dto.js';
import type { InspectionDetailDto, InspectionSummaryDto } from './inventory-response.dto.js';
import { InventoryRepository } from './inventory.repository.js';
import { InspectionRepository } from './inspection.repository.js';

@Injectable()
export class InspectionService {
  public constructor(
    @Inject(InspectionRepository) private readonly repository: InspectionRepository,
    @Inject(InventoryRepository) private readonly inventory: InventoryRepository,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async list(unitId: string, query: InspectionListQueryDto) {
    if ((await this.inventory.findUnit(unitId)) === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const result = await this.repository.list(unitId, query.page, query.pageSize);
    return new PaginatedApiResult(result.items.map(toInspectionSummary), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    });
  }

  public async get(id: string): Promise<InspectionDetailDto> {
    const inspection = await this.repository.find(id);
    if (inspection === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return toInspectionDetail(inspection);
  }

  public async create(
    unitId: string,
    input: CreateInspectionDto,
    actor: AuditActorContext,
  ): Promise<InspectionDetailDto> {
    const inspection = await this.transactions.run(
      'inventory.inspection.create',
      async (transaction) => {
        if (!(await this.repository.lockUnit(unitId, transaction))) {
          throw new ApiError('RESOURCE_NOT_FOUND');
        }
        const unit = await this.inventory.findUnit(unitId, transaction);
        if (unit === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (
          unit.variant.product.type !== 'IPHONE' ||
          unit.variant.inventoryMode !== 'SERIALIZED' ||
          !['RECEIVED', 'AVAILABLE', 'REPAIRING', 'QUARANTINED', 'INSPECTING'].includes(
            unit.lifecycleStatus,
          )
        ) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        if (unit.lifecycleStatus === 'AVAILABLE' && unit._count.reservations > 0) {
          throw new ApiError('INVENTORY_NOT_AVAILABLE');
        }
        if ((await this.repository.findDraft(unitId, transaction)) !== null) {
          throw new ApiError('DUPLICATE_RESOURCE');
        }
        const created = await this.repository.create(
          {
            inventoryUnitId: unitId,
            inspectionType: input.inspectionType,
            inspectorId: actor.actorUserId,
            checks: { schemaVersion: 1, items: {} },
            status: 'DRAFT',
            overallResult: 'INCOMPLETE',
            isCurrent: false,
          },
          transaction,
        );
        await this.inventory.updateUnit(unitId, { lifecycleStatus: 'INSPECTING' }, transaction);
        await this.audit.write(transaction, actor, {
          action: 'inventory.inspection.created',
          resourceType: 'InventoryInspection',
          resourceId: created.id,
          changes: {
            after: { status: 'DRAFT', inspectionType: created.inspectionType, unitId },
          },
        });
        return created;
      },
    );
    return toInspectionDetail(inspection);
  }

  public async update(
    id: string,
    input: UpdateInspectionDto,
    actor: AuditActorContext,
    role: UserRole,
  ): Promise<InspectionDetailDto> {
    let checks: Prisma.InputJsonObject | undefined;
    if (input.checks !== undefined) {
      checks = checklistJson(input.checks, false);
    }
    const inspection = await this.transactions.run(
      'inventory.inspection.update',
      async (transaction) => {
        const existing = await this.repository.find(id, transaction);
        if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
        assertDraftOwner(existing.status, existing.inspectorId, actor.actorUserId, role);
        const updated = await this.repository.update(
          id,
          {
            ...(input.batteryHealthPercent === undefined
              ? {}
              : { batteryHealthPercent: input.batteryHealthPercent }),
            ...(input.batteryCycleCount === undefined
              ? {}
              : { batteryCycleCount: input.batteryCycleCount }),
            ...(input.batteryReplacementStatus === undefined
              ? {}
              : { batteryReplacementStatus: input.batteryReplacementStatus }),
            ...(input.conditionGrade === undefined ? {} : { conditionGrade: input.conditionGrade }),
            ...(input.cosmeticNotes === undefined ? {} : { cosmeticNotes: input.cosmeticNotes }),
            ...(checks === undefined ? {} : { checks }),
            ...(input.repairHistoryStatus === undefined
              ? {}
              : { repairHistoryStatus: input.repairHistoryStatus }),
            ...(input.repairNotes === undefined ? {} : { repairNotes: input.repairNotes }),
            ...(input.replacedParts === undefined
              ? {}
              : { replacedParts: jsonValue(input.replacedParts) }),
          },
          transaction,
        );
        return updated;
      },
    );
    return toInspectionDetail(inspection);
  }

  public async complete(
    id: string,
    actor: AuditActorContext,
    role: UserRole,
  ): Promise<InspectionDetailDto> {
    const inspection = await this.transactions.run(
      'inventory.inspection.complete',
      async (transaction) => {
        const existing = await this.repository.find(id, transaction);
        if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (!(await this.repository.lockUnit(existing.inventoryUnitId, transaction))) {
          throw new ApiError('RESOURCE_NOT_FOUND');
        }
        assertDraftOwner(existing.status, existing.inspectorId, actor.actorUserId, role);
        const checks = validateComplete(existing.checks);
        if (existing.batteryHealthPercent === null) {
          throw validation('batteryHealthPercent', 'BATTERY_HEALTH_REQUIRED');
        }
        if (existing.conditionGrade === null) {
          throw validation('conditionGrade', 'CONDITION_GRADE_REQUIRED');
        }
        if (existing.repairHistoryStatus === 'KNOWN' && !existing.repairNotes?.trim()) {
          throw validation('repairNotes', 'REPAIR_NOTES_REQUIRED');
        }
        const result = inspectionResult(checks);
        await this.repository.clearCurrent(existing.inventoryUnitId, transaction);
        const completed = await this.repository.update(
          id,
          {
            status: 'COMPLETED',
            overallResult: result,
            inspectedAt: new Date(),
            isCurrent: true,
          },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'inventory.inspection.completed',
          resourceType: 'InventoryInspection',
          resourceId: id,
          changes: {
            before: { status: 'DRAFT', overallResult: 'INCOMPLETE', isCurrent: false },
            after: { status: 'COMPLETED', overallResult: result, isCurrent: true },
          },
          metadata: { inventoryUnitId: existing.inventoryUnitId, schemaVersion: 1 },
        });
        return completed;
      },
    );
    return toInspectionDetail(inspection);
  }
}

function assertDraftOwner(
  status: 'DRAFT' | 'COMPLETED',
  inspectorId: string,
  actorId: string,
  role: UserRole,
): void {
  if (status !== 'DRAFT') throw new ApiError('INVALID_STATE_TRANSITION');
  if (inspectorId !== actorId && role !== 'ADMIN') throw new ApiError('FORBIDDEN');
}

function checklistJson(input: unknown, complete: boolean): Prisma.InputJsonObject {
  try {
    return validateInspectionChecklist(input, complete) as unknown as Prisma.InputJsonObject;
  } catch (error) {
    if (error instanceof InspectionChecklistError) {
      throw validation('checks', error.code);
    }
    throw error;
  }
}

function validateComplete(input: unknown) {
  try {
    return validateInspectionChecklist(input, true);
  } catch (error) {
    if (error instanceof InspectionChecklistError) {
      throw validation('checks', error.code);
    }
    throw error;
  }
}

function jsonValue(input: unknown): Prisma.InputJsonValue {
  if (!isJsonValue(input)) throw validation('replacedParts', 'INVALID_JSON_VALUE');
  return input;
}

function isJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function toInspectionSummary(inspection: {
  id: string;
  inspectionType: InspectionSummaryDto['inspectionType'];
  status: InspectionSummaryDto['status'];
  overallResult: InspectionSummaryDto['overallResult'];
  isCurrent: boolean;
  inspectorId: string;
  inspectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): InspectionSummaryDto {
  return {
    id: inspection.id,
    inspectionType: inspection.inspectionType,
    status: inspection.status,
    overallResult: inspection.overallResult,
    isCurrent: inspection.isCurrent,
    inspectorId: inspection.inspectorId,
    inspectedAt: inspection.inspectedAt,
    createdAt: inspection.createdAt,
    updatedAt: inspection.updatedAt,
  };
}

function toInspectionDetail(
  inspection: Awaited<ReturnType<InspectionRepository['find']>> extends infer T
    ? Exclude<T, null>
    : never,
): InspectionDetailDto {
  const summary = toInspectionSummary(inspection);
  return {
    id: summary.id,
    inspectionType: summary.inspectionType,
    status: summary.status,
    overallResult: summary.overallResult,
    isCurrent: summary.isCurrent,
    inspectorId: summary.inspectorId,
    inspectedAt: summary.inspectedAt,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    inventoryUnitId: inspection.inventoryUnitId,
    batteryHealthPercent: inspection.batteryHealthPercent,
    batteryCycleCount: inspection.batteryCycleCount,
    batteryReplacementStatus: inspection.batteryReplacementStatus,
    conditionGrade: inspection.conditionGrade,
    cosmeticNotes: inspection.cosmeticNotes,
    checks: inspection.checks,
    repairHistoryStatus: inspection.repairHistoryStatus,
    repairNotes: inspection.repairNotes,
    replacedParts: inspection.replacedParts,
  };
}

function validation(field: string, code: string): ApiError {
  return new ApiError('VALIDATION_FAILED', undefined, [{ field, code, message: code }]);
}
