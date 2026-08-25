import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import { AfterSalesNotificationService } from '../notifications/after-sales-notification.service.js';
import { AfterSalesOrderGateway } from '../order-transaction-ports/after-sales-order.gateway.js';
import { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { generateAfterSalesRequestNumber } from './after-sales-code.js';
import { AfterSalesClock } from './after-sales-clock.service.js';
import type { CreateAfterSalesRequestDto } from './after-sales.dto.js';
import {
  afterSalesAuditActor,
  afterSalesCustomerId,
  assertAfterSalesOwnership,
} from './after-sales-ownership.js';
import { isWarrantyValid } from './after-sales-policy.js';
import { projectAfterSalesDetail } from './after-sales.projector.js';
import type { AfterSalesDetailDto } from './after-sales-response.dto.js';
import { AfterSalesRepository, type AfterSalesPublicRecord } from './after-sales.repository.js';

@Injectable()
export class AfterSalesCommandService {
  public constructor(
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AfterSalesOrderGateway) private readonly orders: AfterSalesOrderGateway,
    @Inject(AfterSalesRepository) private readonly repository: AfterSalesRepository,
    @Inject(OrderOwnershipPolicy) private readonly ownership: OrderOwnershipPolicy,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(AfterSalesNotificationService)
    private readonly notifications: AfterSalesNotificationService,
    @Inject(AfterSalesClock) private readonly clock: AfterSalesClock,
  ) {}

  public async create(
    request: Request,
    input: CreateAfterSalesRequestDto,
  ): Promise<AfterSalesDetailDto> {
    const actor = afterSalesAuditActor(request);
    const preflight = await this.orders.findItemContext(input.orderItemId);
    if (preflight === null) throw new ApiError('RESOURCE_NOT_FOUND');
    assertAfterSalesOwnership(this.ownership, request, preflight.order, this.clock.now());
    if (preflight.order.status !== 'COMPLETED' || preflight.order.completedAt === null) {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }

    let created: AfterSalesPublicRecord;
    try {
      created = await this.transactions.run(
        'after_sales.create',
        async (transaction) => {
          const item = await this.orders.lockCompletedItem(input.orderItemId, transaction);
          if (item === null) throw new ApiError('RESOURCE_NOT_FOUND');
          const now = this.clock.now();
          assertAfterSalesOwnership(this.ownership, request, item.order, now);
          if ((await this.repository.findOpenForOrderItem(item.id, transaction)) !== null) {
            throw new ApiError('AFTER_SALES_REQUEST_ALREADY_OPEN');
          }

          const warranty = input.type === 'WARRANTY' ? item.warranty : null;
          if (input.type === 'WARRANTY' && (warranty === null || !isWarrantyValid(warranty, now))) {
            throw new ApiError('WARRANTY_NOT_ACTIVE');
          }
          const settings = await this.settings.read(transaction);
          const requestNumber = generateAfterSalesRequestNumber(now, settings.timezone);
          const record = await this.repository.create(
            {
              requestNumber,
              orderItemId: item.id,
              customerId: afterSalesCustomerId(request),
              warrantyId: warranty?.id ?? null,
              type: input.type,
              issueDescription: input.issueDescription,
              requestedResolution: input.requestedResolution ?? null,
              attachments: [],
            },
            transaction,
          );
          await this.audit.write(transaction, actor, {
            action: 'after_sales.created',
            resourceType: 'AfterSalesRequest',
            resourceId: record.id,
            changes: { after: { status: 'REQUESTED', type: input.type } },
            metadata: {
              requestNumber,
              orderItemId: item.id,
              issue: { present: true, length: input.issueDescription.length },
              requestedResolution: textShape(input.requestedResolution ?? null),
            },
          });
          return record;
        },
        isRequestNumberCollision,
      );
    } catch (error) {
      if (isOpenCaseUniqueConflict(error)) {
        throw new ApiError('AFTER_SALES_REQUEST_ALREADY_OPEN');
      }
      throw error;
    }
    await this.notify(created, actor.requestId);
    return projectAfterSalesDetail(created, this.clock.now());
  }

  public async cancel(
    request: Request,
    requestNumber: string,
    reason: string,
  ): Promise<AfterSalesDetailDto> {
    const actor = afterSalesAuditActor(request);
    const preflight = await this.repository.findByRequestNumber(requestNumber);
    if (preflight === null) throw new ApiError('RESOURCE_NOT_FOUND');
    assertAfterSalesOwnership(this.ownership, request, preflight.orderItem.order, this.clock.now());

    const outcome = await this.transactions.run('after_sales.cancel', async (transaction) => {
      const record = await this.repository.lockById(preflight.id, transaction);
      if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const now = this.clock.now();
      assertAfterSalesOwnership(this.ownership, request, record.orderItem.order, now);
      if (record.status === 'CANCELLED') {
        if (record.cancelReason !== reason) throw new ApiError('INVALID_STATE_TRANSITION');
        return { record, changed: false };
      }
      if (record.status !== 'REQUESTED') throw new ApiError('INVALID_STATE_TRANSITION');
      const updated = await this.repository.update(
        record.id,
        { status: 'CANCELLED', cancelReason: reason, cancelledAt: now },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'after_sales.cancelled',
        resourceType: 'AfterSalesRequest',
        resourceId: record.id,
        changes: { before: { status: 'REQUESTED' }, after: { status: 'CANCELLED' } },
        metadata: { reason: textShape(reason) },
      });
      return { record: updated, changed: true };
    });
    if (outcome.changed) await this.notify(outcome.record, actor.requestId);
    return projectAfterSalesDetail(outcome.record, this.clock.now());
  }

  private notify(record: AfterSalesPublicRecord, requestId: string): Promise<void> {
    return this.notifications.sendUpdated({
      requestId,
      requestNumber: record.requestNumber,
      orderNumber: record.orderItem.order.orderNumber,
      customerEmail: record.orderItem.order.customerEmail,
      status: record.status,
    });
  }
}

function textShape(value: string | null): { present: boolean; length: number } {
  return { present: value !== null, length: value?.length ?? 0 };
}

function isRequestNumberCollision(error: unknown): boolean {
  if (!isUniqueError(error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target)
    ? target.some((value) => value === 'request_number' || value === 'requestNumber')
    : typeof target === 'string' && /request(_number|Number)/.test(target);
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function isOpenCaseUniqueConflict(error: unknown): boolean {
  if (!isUniqueError(error) || isRequestNumberCollision(error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target)
    ? target.some((value) => value === 'order_item_id' || value === 'orderItemId')
    : typeof target === 'string' && /order(_item_id|ItemId)/.test(target);
}
