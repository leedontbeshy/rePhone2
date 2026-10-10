import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import {
  AfterSalesInventoryGateway,
  type AfterSalesInspection,
} from '../inventory/after-sales-inventory.gateway.js';
import {
  AfterSalesOrderGateway,
  type AfterSalesOrderItemContext,
} from '../order-transaction-ports/after-sales-order.gateway.js';
import { AfterSalesRefundGateway } from '../refunds/after-sales-refund.gateway.js';
import { WarrantyTransactionGateway } from '../warranty/warranty-transaction.gateway.js';
import {
  AfterSalesCommandRepository,
  type AfterSalesCommandRecord,
  type AfterSalesResolutionUpdate,
} from './after-sales-command.repository.js';
import { AfterSalesClock } from './after-sales-clock.service.js';
import { dealerPrice } from '../dealers/dealer-pricing.policy.js';
import type {
  ApproveAfterSalesRequestDto,
  AssignAfterSalesRequestDto,
  ReceiveAfterSalesRequestDto,
  RecordAfterSalesInspectionSummaryDto,
  RejectAfterSalesRequestDto,
  ResolveAfterSalesDto,
  ResolveAfterSalesRefundedDto,
  ResolveAfterSalesReplacedDto,
} from './after-sales.dto.js';

type StaffRole = 'EMPLOYEE' | 'ADMIN';
type SimpleResolution = 'REPAIRED' | 'RETURNED_UNCHANGED' | 'OTHER';

interface LockedCommandContext {
  request: AfterSalesCommandRecord;
  item: AfterSalesOrderItemContext;
}

export interface AfterSalesCommandOutcome {
  record: AfterSalesCommandRecord;
  /** True only when this committed execution wrote the lifecycle change; post-commit notifications use it. */
  changed: boolean;
}

@Injectable()
export class AfterSalesBackofficeCommandService {
  public constructor(
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AfterSalesCommandRepository)
    private readonly repository: AfterSalesCommandRepository,
    @Inject(AfterSalesOrderGateway) private readonly orders: AfterSalesOrderGateway,
    @Inject(AfterSalesInventoryGateway) private readonly inventory: AfterSalesInventoryGateway,
    @Inject(AfterSalesRefundGateway) private readonly refunds: AfterSalesRefundGateway,
    @Inject(WarrantyTransactionGateway)
    private readonly warranties: WarrantyTransactionGateway,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(AfterSalesClock) private readonly clock: AfterSalesClock,
  ) {}

  public assignAfterSalesRequest(
    id: string,
    input: AssignAfterSalesRequestDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    const employeeId = input.employeeId ?? null;
    return this.execute('after_sales.assign', id, async ({ request }, transaction) => {
      assertAssignable(request);
      if (request.assignedToId === employeeId) return outcome(request, false);
      if (
        employeeId !== null &&
        (await this.repository.findActiveEmployee(employeeId, transaction)) === null
      ) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const updated = await this.repository.assign(
        request.id,
        employeeId,
        this.clock.now(),
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'after_sales.assigned',
        resourceType: 'AfterSalesRequest',
        resourceId: request.id,
        changes: {
          before: { assignedToId: request.assignedToId },
          after: { assignedToId: employeeId },
        },
        metadata: { requestNumber: request.requestNumber },
      });
      return outcome(updated, true);
    });
  }

  public receiveAfterSalesRequest(
    id: string,
    input: ReceiveAfterSalesRequestDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    const receiveNote = input.note?.trim() ?? null;
    return this.execute('after_sales.receive', id, async ({ request, item }, transaction) => {
      if (request.status === 'RECEIVED') {
        if (
          request.receivedLocationId === input.receivedLocationId &&
          request.receivedById === actor.actorUserId &&
          request.receiveNote === receiveNote
        ) {
          return outcome(request, false);
        }
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      if (request.status !== 'REQUESTED') throw new ApiError('INVALID_STATE_TRANSITION');
      const location = await this.inventory.findActiveLocation(
        input.receivedLocationId,
        transaction,
      );
      if (location === null) throw new ApiError('RESOURCE_NOT_FOUND');

      if (isIphone(item)) {
        const unitId = requireOriginalUnit(item);
        await this.inventory.receiveSoldUnit(
          {
            unitId,
            receivedLocationId: location.id,
            originalSoldAt: requireOrderCompletedAt(item),
          },
          transaction,
        );
      }

      const now = this.clock.now();
      const updated = await this.repository.receive(
        {
          id: request.id,
          receivedLocationId: location.id,
          receivedById: actor.actorUserId,
          receiveNote,
          receivedAt: now,
        },
        transaction,
      );
      await this.writeStatusAudit(transaction, actor, request, 'after_sales.received', 'RECEIVED', {
        receivedLocationId: location.id,
        receiveNotePresent: receiveNote !== null,
      });
      return outcome(updated, true);
    });
  }

  public startAfterSalesInspection(
    id: string,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    return this.execute(
      'after_sales.start-inspection',
      id,
      async ({ request, item }, transaction) => {
        if (request.status === 'INSPECTING') return outcome(request, false);
        if (request.status !== 'RECEIVED') throw new ApiError('INVALID_STATE_TRANSITION');

        let inventoryInspectionId: string | null = null;
        if (isIphone(item)) {
          const inspection = await this.inventory.createInspectionDraft(
            {
              unitId: requireOriginalUnit(item),
              inspectionType: expectedInspectionType(request),
              inspectorId: actor.actorUserId,
            },
            transaction,
          );
          inventoryInspectionId = inspection.id;
        }

        const now = this.clock.now();
        const updated = await this.repository.startInspection(
          { id: request.id, inventoryInspectionId, inspectedAt: now },
          transaction,
        );
        await this.writeStatusAudit(
          transaction,
          actor,
          request,
          'after_sales.inspection_started',
          'INSPECTING',
          {
            inspectionType: isIphone(item) ? expectedInspectionType(request) : 'ACCESSORY_SUMMARY',
            inventoryInspectionId,
          },
        );
        return outcome(updated, true);
      },
    );
  }

  public recordAfterSalesInspectionSummary(
    id: string,
    input: RecordAfterSalesInspectionSummaryDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    const summary = input.inspectionSummary.trim();
    return this.execute(
      'after_sales.record-inspection-summary',
      id,
      async ({ request, item }, transaction) => {
        if (isIphone(item)) throw requirementsNotMet();
        if (request.status !== 'INSPECTING') throw new ApiError('INVALID_STATE_TRANSITION');
        if (request.inspectionSummary === summary) return outcome(request, false);
        const updated = await this.repository.recordInspectionSummary(
          request.id,
          summary,
          this.clock.now(),
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'after_sales.inspection_summary_recorded',
          resourceType: 'AfterSalesRequest',
          resourceId: request.id,
          changes: {
            before: { summaryLength: request.inspectionSummary?.length ?? 0 },
            after: { summaryLength: summary.length },
          },
          metadata: { requestNumber: request.requestNumber },
        });
        return outcome(updated, true);
      },
    );
  }

  public approveAfterSalesRequest(
    id: string,
    input: ApproveAfterSalesRequestDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    const note = input.note.trim();
    return this.execute('after_sales.approve', id, async ({ request, item }, transaction) => {
      if (request.status === 'APPROVED') {
        if (request.decisionNote === note && request.decidedById === actor.actorUserId) {
          return outcome(request, false);
        }
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      if (request.status !== 'INSPECTING') throw new ApiError('INVALID_STATE_TRANSITION');
      await this.assertDecisionReady(request, item, transaction);
      const updated = await this.repository.approve(
        { id: request.id, note, actorUserId: actor.actorUserId, decidedAt: this.clock.now() },
        transaction,
      );
      await this.writeStatusAudit(transaction, actor, request, 'after_sales.approved', 'APPROVED', {
        productType: item.productTypeSnapshot,
      });
      return outcome(updated, true);
    });
  }

  public rejectAfterSalesRequest(
    id: string,
    input: RejectAfterSalesRequestDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    const reason = input.reason.trim();
    const returnNote = input.returnNote?.trim() ?? null;
    return this.execute('after_sales.reject', id, async ({ request, item }, transaction) => {
      if (request.status === 'REJECTED') {
        if (
          request.decisionNote === reason &&
          request.returnNote === returnNote &&
          request.decidedById === actor.actorUserId
        ) {
          return outcome(request, false);
        }
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      if (request.status !== 'INSPECTING') throw new ApiError('INVALID_STATE_TRANSITION');
      await this.assertDecisionReady(request, item, transaction);

      const iphone = isIphone(item);
      if (iphone && returnNote === null) throw requirementsNotMet();
      if (iphone) {
        await this.inventory.returnUnitToCustomer(
          {
            unitId: requireOriginalUnit(item),
            originalSoldAt: requireOrderCompletedAt(item),
          },
          transaction,
        );
      }
      const now = this.clock.now();
      const updated = await this.repository.reject(
        {
          id: request.id,
          reason,
          actorUserId: actor.actorUserId,
          decidedAt: now,
          returnNote,
          returnedAt: iphone || returnNote !== null ? now : null,
        },
        transaction,
      );
      await this.writeStatusAudit(transaction, actor, request, 'after_sales.rejected', 'REJECTED', {
        productType: item.productTypeSnapshot,
        returnedToCustomer: iphone,
      });
      return outcome(updated, true);
    });
  }

  public resolveAfterSalesRepaired(
    id: string,
    input: ResolveAfterSalesDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    return this.resolveSimple(id, input, actor, 'REPAIRED');
  }

  public resolveAfterSalesReturnedUnchanged(
    id: string,
    input: ResolveAfterSalesDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    return this.resolveSimple(id, input, actor, 'RETURNED_UNCHANGED');
  }

  public resolveAfterSalesOther(
    id: string,
    input: ResolveAfterSalesDto,
    actor: AuditActorContext,
    role: StaffRole,
  ): Promise<AfterSalesCommandOutcome> {
    if (role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    return this.resolveSimple(id, input, actor, 'OTHER');
  }

  public resolveAfterSalesReplaced(
    id: string,
    input: ResolveAfterSalesReplacedDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    const note = input.resolutionNote.trim();
    return this.execute('after_sales.resolve-replaced', id, async (context, transaction) => {
      const { request, item } = context;
      if (
        resolutionReplay(
          request,
          'REPLACED',
          note,
          actor.actorUserId,
          input.replacementInventoryUnitId,
        )
      ) {
        return outcome(request, false);
      }
      assertApproved(request);
      if (!isIphone(item)) throw requirementsNotMet();
      const originalUnitId = requireOriginalUnit(item);
      if (originalUnitId === input.replacementInventoryUnitId) throw requirementsNotMet();

      if (item.order.channel === 'DEALER') {
        await this.inventory.lockUnit(input.replacementInventoryUnitId, transaction);
        const replacement = await transaction.inventoryUnit.findUnique({
          where: { id: input.replacementInventoryUnitId },
          include: { dealerOverride: true },
        });
        const policy = await transaction.dealerPricingPolicy.findUnique({
          where: { key: 'GLOBAL' },
        });
        const amount = (value: { toString(): string } | null) =>
          value === null ? null : BigInt(value.toString());
        const replacementPrice =
          replacement === null || policy === null
            ? null
            : dealerPrice({
                publicPrice: amount(replacement.salePrice),
                acquisitionCost: amount(replacement.acquisitionCost),
                additionalCost: BigInt(replacement.additionalCost.toString()),
                reserve: amount(policy.reserveAmount),
                minimumProfit: amount(policy.minimumProfit),
                discountBps: policy.discountBps,
                override: amount(replacement.dealerOverride?.price ?? null),
              });
        if (
          replacement?.variantId !== item.variantId ||
          replacementPrice !== BigInt(item.lineTotal.toString())
        )
          throw new ApiError(
            'INVALID_STATE_TRANSITION',
            'Đổi trực tiếp cần cùng cấu hình và cùng giá đại lý. Khác giá: hoàn đơn cũ rồi tạo đơn mới có liên kết.',
          );
      }

      const warranty = await this.lockRelatedWarranty(context, transaction);
      if (warranty !== null && warranty.inventoryUnitId !== originalUnitId) {
        throw requirementsNotMet();
      }
      const original = await this.inventory.lockUnit(originalUnitId, transaction);
      if (
        original === null ||
        original.lifecycleStatus !== 'INSPECTING' ||
        original.variant.productId !== item.productId
      ) {
        throw requirementsNotMet();
      }
      await this.inventory.allocateReplacement(
        {
          unitId: input.replacementInventoryUnitId,
          expectedProductId: item.productId,
          now: this.clock.now(),
        },
        transaction,
      );
      if (warranty !== null) {
        await this.warranties.moveToReplacementUnit(
          {
            id: warranty.id,
            originalInventoryUnitId: originalUnitId,
            replacementInventoryUnitId: input.replacementInventoryUnitId,
          },
          transaction,
        );
      }

      const now = this.clock.now();
      const updated = await this.repository.resolve(
        request.id,
        {
          resolutionType: 'REPLACED',
          resolutionNote: note,
          resolvedById: actor.actorUserId,
          resolvedAt: now,
          replacementInventoryUnitId: input.replacementInventoryUnitId,
        },
        transaction,
      );
      await this.writeResolutionAudit(transaction, actor, request, updated, {
        replacementInventoryUnitId: input.replacementInventoryUnitId,
        warrantyMoved: warranty !== null,
      });
      return outcome(updated, true);
    });
  }

  public async resolveAfterSalesRefunded(
    id: string,
    input: ResolveAfterSalesRefundedDto,
    actor: AuditActorContext,
  ): Promise<AfterSalesCommandOutcome> {
    const note = input.resolutionNote.trim();
    try {
      return await this.execute(
        'after_sales.resolve-refunded',
        id,
        async (context, transaction) => {
          const { request, item } = context;
          if (
            resolutionReplay(
              request,
              'REFUNDED',
              note,
              actor.actorUserId,
              undefined,
              input.refundId,
            )
          ) {
            return outcome(request, false);
          }
          assertApproved(request);
          const warranty = await this.lockRelatedWarranty(context, transaction);
          const refund = await this.refunds.lockCompletedForOrder(
            input.refundId,
            item.orderId,
            transaction,
          );
          if (refund === null || !isPositiveMoney(refund.amount)) throw requirementsNotMet();

          if (warranty?.status === 'ACTIVE') {
            await this.warranties.voidActive(
              {
                id: warranty.id,
                reason: `Hoàn tiền theo yêu cầu hậu mãi ${request.requestNumber}`,
                actorUserId: actor.actorUserId,
                now: this.clock.now(),
              },
              transaction,
            );
          }
          const now = this.clock.now();
          const updated = await this.repository.resolve(
            request.id,
            {
              resolutionType: 'REFUNDED',
              resolutionNote: note,
              resolvedById: actor.actorUserId,
              resolvedAt: now,
              refundId: refund.id,
            },
            transaction,
          );
          await this.writeResolutionAudit(transaction, actor, request, updated, {
            refundId: refund.id,
            warrantyVoided: warranty?.status === 'ACTIVE',
          });
          return outcome(updated, true);
        },
      );
    } catch (error) {
      if (isUniqueError(error)) throw requirementsNotMet();
      throw error;
    }
  }

  private resolveSimple(
    id: string,
    input: ResolveAfterSalesDto,
    actor: AuditActorContext,
    resolutionType: SimpleResolution,
  ): Promise<AfterSalesCommandOutcome> {
    const note = input.resolutionNote.trim();
    return this.execute(
      `after_sales.resolve-${resolutionType.toLowerCase()}`,
      id,
      async ({ request, item }, transaction) => {
        if (resolutionReplay(request, resolutionType, note, actor.actorUserId)) {
          return outcome(request, false);
        }
        assertApproved(request);

        const now = this.clock.now();
        const returnsIphone = resolutionType !== 'OTHER' && isIphone(item);
        if (returnsIphone) {
          await this.inventory.returnUnitToCustomer(
            {
              unitId: requireOriginalUnit(item),
              originalSoldAt: requireOrderCompletedAt(item),
            },
            transaction,
          );
        }
        const update: AfterSalesResolutionUpdate = {
          resolutionType,
          resolutionNote: note,
          resolvedById: actor.actorUserId,
          resolvedAt: now,
          ...(returnsIphone ? { returnNote: note, returnedAt: now } : {}),
        };
        const updated = await this.repository.resolve(request.id, update, transaction);
        await this.writeResolutionAudit(transaction, actor, request, updated, {
          returnedToCustomer: returnsIphone,
        });
        return outcome(updated, true);
      },
    );
  }

  private execute(
    operation: string,
    id: string,
    work: (
      context: LockedCommandContext,
      transaction: Prisma.TransactionClient,
    ) => Promise<AfterSalesCommandOutcome>,
  ): Promise<AfterSalesCommandOutcome> {
    return this.transactions.run(operation, async (transaction) => {
      const candidate = await this.repository.findOrderItemId(id, transaction);
      if (candidate === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const item = await this.orders.lockCompletedItem(candidate.orderItemId, transaction);
      if (item === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const request = await this.repository.lockById(id, transaction);
      if (request === null || request.orderItemId !== item.id) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      const result = await work({ request, item }, transaction);
      if (
        item.order.channel === 'DEALER' &&
        result.changed &&
        result.record.status === 'RESOLVED' &&
        ['REPAIRED', 'REPLACED'].includes(result.record.resolutionType ?? '') &&
        request.receivedAt !== null &&
        result.record.resolvedAt !== null
      ) {
        const days = Math.max(
          0,
          Math.ceil(
            (result.record.resolvedAt.getTime() - request.receivedAt.getTime()) / 86400_000,
          ),
        );
        const warranty = await this.lockRelatedWarranty({ request, item }, transaction);
        if (warranty !== null && warranty.status === 'ACTIVE') {
          await transaction.warranty.update({
            where: { id: warranty.id },
            data: {
              daysSnapshot: { increment: days },
              endAt: new Date(warranty.endAt.getTime() + days * 86400_000),
            },
          });
          await transaction.afterSalesRequest.update({
            where: { id },
            data: { dealerWarrantyExtensionDays: days },
          });
        }
      }
      return result;
    });
  }

  private async assertDecisionReady(
    request: AfterSalesCommandRecord,
    item: AfterSalesOrderItemContext,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (item.order.channel === 'DEALER') {
      const record = await transaction.afterSalesRequest.findUnique({
        where: { id: request.id },
        select: { dealerAssessment: true },
      });
      const assessment = record?.dealerAssessment as Record<string, unknown> | null | undefined;
      if (
        assessment === null ||
        assessment === undefined ||
        assessment['cause'] === 'UNDETERMINED' ||
        assessment['coverage'] === 'PENDING' ||
        assessment['shippingPayer'] === 'UNDETERMINED'
      )
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Chốt kết quả kiểm định, phạm vi bảo hành và bên chịu phí trong mục Đại lý trước khi quyết định.',
        );
    }
    if (!isIphone(item)) {
      if (request.inventoryInspectionId !== null || request.inspectionSummary === null) {
        throw requirementsNotMet();
      }
      return;
    }
    if (request.inventoryInspectionId === null) throw requirementsNotMet();
    const inspection = await this.inventory.lockInspection(
      request.inventoryInspectionId,
      transaction,
    );
    if (!isCompletedInspection(inspection, request, requireOriginalUnit(item))) {
      throw requirementsNotMet();
    }
  }

  private async lockRelatedWarranty(
    { request, item }: LockedCommandContext,
    transaction: Prisma.TransactionClient,
  ) {
    const warrantyId = request.warrantyId ?? item.warranty?.id ?? null;
    if (warrantyId === null) return null;
    const warranty = await this.warranties.lockById(warrantyId, transaction);
    if (warranty === null || warranty.orderItemId !== item.id) throw requirementsNotMet();
    return warranty;
  }

  private writeStatusAudit(
    transaction: Prisma.TransactionClient,
    actor: AuditActorContext,
    request: AfterSalesCommandRecord,
    action: string,
    afterStatus: string,
    metadata: Record<string, string | boolean | null>,
  ) {
    return this.audit.write(transaction, actor, {
      action,
      resourceType: 'AfterSalesRequest',
      resourceId: request.id,
      changes: { before: { status: request.status }, after: { status: afterStatus } },
      metadata: { requestNumber: request.requestNumber, ...metadata },
    });
  }

  private writeResolutionAudit(
    transaction: Prisma.TransactionClient,
    actor: AuditActorContext,
    before: AfterSalesCommandRecord,
    after: AfterSalesCommandRecord,
    metadata: Record<string, string | boolean | null>,
  ) {
    return this.audit.write(transaction, actor, {
      action: 'after_sales.resolved',
      resourceType: 'AfterSalesRequest',
      resourceId: before.id,
      changes: {
        before: { status: before.status, resolutionType: before.resolutionType },
        after: { status: after.status, resolutionType: after.resolutionType },
      },
      metadata: { requestNumber: before.requestNumber, ...metadata },
    });
  }
}

function assertAssignable(request: AfterSalesCommandRecord): void {
  if (!['REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED'].includes(request.status)) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
}

function assertApproved(request: AfterSalesCommandRecord): void {
  if (request.status !== 'APPROVED') throw new ApiError('INVALID_STATE_TRANSITION');
}

function isIphone(item: AfterSalesOrderItemContext): boolean {
  return item.productTypeSnapshot === 'IPHONE';
}

function requireOriginalUnit(item: AfterSalesOrderItemContext): string {
  if (!isIphone(item) || item.inventoryUnitId === null) throw requirementsNotMet();
  return item.inventoryUnitId;
}

function requireOrderCompletedAt(item: AfterSalesOrderItemContext): Date {
  if (item.order.completedAt === null) throw requirementsNotMet();
  return item.order.completedAt;
}

function expectedInspectionType(request: AfterSalesCommandRecord): 'WARRANTY' | 'RETURN' {
  return request.type === 'WARRANTY' ? 'WARRANTY' : 'RETURN';
}

function isCompletedInspection(
  inspection: AfterSalesInspection | null,
  request: AfterSalesCommandRecord,
  unitId: string,
): boolean {
  return (
    inspection !== null &&
    inspection.inventoryUnitId === unitId &&
    inspection.inspectionType === expectedInspectionType(request) &&
    inspection.status === 'COMPLETED' &&
    inspection.inspectedAt !== null
  );
}

function resolutionReplay(
  request: AfterSalesCommandRecord,
  resolutionType: SimpleResolution | 'REPLACED' | 'REFUNDED',
  note: string,
  actorUserId: string,
  replacementInventoryUnitId?: string,
  refundId?: string,
): boolean {
  if (request.status !== 'RESOLVED') return false;
  if (
    request.resolutionType !== resolutionType ||
    request.resolutionNote !== note ||
    request.resolvedById !== actorUserId ||
    request.replacementInventoryUnitId !== (replacementInventoryUnitId ?? null) ||
    request.refundId !== (refundId ?? null)
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  return true;
}

function isPositiveMoney(value: string): boolean {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function requirementsNotMet(): ApiError {
  return new ApiError('AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET');
}

function outcome(record: AfterSalesCommandRecord, changed: boolean): AfterSalesCommandOutcome {
  return { record, changed };
}
