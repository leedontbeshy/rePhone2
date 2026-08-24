import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { OrderCancellationService } from '../order-cancellation/order-cancellation.service.js';
import { FulfillmentOrderGateway } from '../order-transaction-ports/fulfillment-order.gateway.js';
import type { UpdateBackofficeOrderInternalNoteDto } from './fulfillment.dto.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { projectBackofficeOrderDetail } from './fulfillment.projector.js';
import type { BackofficeOrderDetailDto } from './fulfillment-response.dto.js';

@Injectable()
export class BackofficeOrderService {
  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
    @Inject(OrderCancellationService)
    private readonly cancellations: OrderCancellationService,
  ) {}

  public async updateInternalNote(
    id: string,
    input: UpdateBackofficeOrderInternalNoteDto,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const note = input.internalNote === null ? null : input.internalNote.trim();
    await this.transactions.run('fulfillment.internal-note', async (transaction) => {
      const order = await this.orders.lock(id, transaction);
      if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (order.internalNote === note) return;
      await transaction.order.update({ where: { id: order.id }, data: { internalNote: note } });
      await this.audit.write(
        transaction,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'order.internal_note_updated',
          resourceType: 'Order',
          resourceId: order.id,
          changes: {
            before: noteShape(order.internalNote),
            after: noteShape(note),
          },
          metadata: { orderNumber: order.orderNumber },
        },
      );
    });
    const order = await this.orders.findById(id);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeOrderDetail(order, this.clock.now());
  }

  public async cancel(
    id: string,
    reason: string,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    await this.cancellations.cancelByStaff(id, reason, auth, request);
    const order = await this.orders.findById(id);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeOrderDetail(order, this.clock.now());
  }
}

function noteShape(note: string | null): { present: boolean; length: number } {
  return { present: note !== null, length: note?.length ?? 0 };
}
