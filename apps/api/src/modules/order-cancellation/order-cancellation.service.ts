import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditWriteActorContext } from '../audit/audit.types.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { OrderNotificationService } from '../notifications/order-notification.service.js';
import {
  OrderOwnershipPolicy,
  type OrderOwnershipRecord,
} from '../order-transaction-ports/order-ownership.policy.js';
import { RefundOrderGateway } from '../order-transaction-ports/refund-order.gateway.js';
import { customerOrderInclude, requireOrder } from '../orders/order-projector.js';
import { RefundCoreGateway, type RefundObligationActor } from '../refunds/refund-core.gateway.js';
import { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import { OrderCancellationClock } from './order-cancellation-clock.service.js';

export interface OrderCancellationOutcome {
  orderId: string;
  changed: boolean;
}

type CancellationKind = 'OWNER' | 'STAFF';

@Injectable()
export class OrderCancellationService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(OrderOwnershipPolicy)
    private readonly ownership: OrderOwnershipPolicy,
    @Inject(RefundOrderGateway)
    private readonly orders: RefundOrderGateway,
    @Inject(CheckoutInventoryGateway)
    private readonly inventory: CheckoutInventoryGateway,
    @Inject(CheckoutVoucherGateway)
    private readonly vouchers: CheckoutVoucherGateway,
    @Inject(RefundCoreGateway) private readonly refunds: RefundCoreGateway,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OrderNotificationService)
    private readonly notifications: OrderNotificationService,
    @Inject(OrderCancellationClock)
    private readonly clock: OrderCancellationClock,
  ) {}

  public async cancelOwned(
    request: Request,
    orderNumber: string,
    reason: string,
  ): Promise<OrderCancellationOutcome> {
    const initial = requireOrder(
      await this.prisma.order.findUnique({
        where: { orderNumber },
        include: customerOrderInclude,
      }),
    );
    this.ownership.assertAccess(request, initial, this.clock.now());
    const actor = ownerAuditActor(request);
    const refundActor: RefundObligationActor = {
      requesterType: 'CUSTOMER',
      requesterId: request.auth?.userId ?? null,
    };
    return this.cancel(initial.id, 'OWNER', reason, actor, refundActor, request);
  }

  public cancelByStaff(
    orderId: string,
    reason: string,
    auth: AuthContext,
    request: Request,
  ): Promise<OrderCancellationOutcome> {
    return this.cancel(
      orderId,
      'STAFF',
      reason,
      { actorUserId: auth.userId, ...requestContext(request) },
      { requesterType: 'STAFF', requesterId: auth.userId },
      request,
    );
  }

  private async cancel(
    orderId: string,
    kind: CancellationKind,
    reason: string,
    auditActor: AuditWriteActorContext,
    refundActor: RefundObligationActor,
    request: Request,
  ): Promise<OrderCancellationOutcome> {
    const outcome = await this.transactions.run('orders.cancel', async (transaction) => {
      const lockedOrder = await this.orders.lockById(orderId, transaction);
      if (lockedOrder === null) {
        throw new ApiError(kind === 'OWNER' ? 'ORDER_NOT_FOUND' : 'RESOURCE_NOT_FOUND');
      }
      const order = await loadCancellationOrder(orderId, transaction);
      if (order === null) {
        throw new ApiError(kind === 'OWNER' ? 'ORDER_NOT_FOUND' : 'RESOURCE_NOT_FOUND');
      }
      if (kind === 'OWNER') this.ownership.assertAccess(request, order, this.clock.now());
      if (order.status === 'CANCELLED') return { orderId: order.id, changed: false };
      const shipments = await lockShipments(order.id, transaction);
      order.shipments = shipments;
      assertCancellationAllowed(order, kind);

      const now = this.clock.now();
      const refund = await this.refunds.prepareCancellationRefund(
        { orderId: order.id, reason, now, actor: refundActor },
        transaction,
      );

      const cancelled = await this.orders.markCancelled(order.id, reason, now, transaction);
      if (cancelled.count !== 1) throw new ApiError('INVALID_STATE_TRANSITION');
      await transaction.shipment.updateMany({
        where: { orderId: order.id, status: 'CREATED' },
        data: { status: 'CANCELLED' },
      });
      await this.inventory.releaseOrderReservations(order.id, now, transaction);
      await this.vouchers.release(order.id, now, transaction);
      await this.audit.write(transaction, auditActor, {
        action: 'order.cancelled',
        resourceType: 'Order',
        resourceId: order.id,
        changes: {
          before: { status: order.status, fulfillmentStatus: order.fulfillmentStatus },
          after: { status: 'CANCELLED', fulfillmentStatus: 'CANCELLED' },
        },
        metadata: {
          orderNumber: order.orderNumber,
          reason,
          ...(refund === null ? {} : { refundId: refund.id, refundAmount: refund.amount }),
        },
      });
      return { orderId: order.id, changed: true };
    });

    if (outcome.changed) await this.notifyCancelled(outcome.orderId);
    return outcome;
  }

  private async notifyCancelled(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        customerEmail: true,
        cancelReason: true,
        refunds: {
          select: { status: true, amount: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (order === null) return;
    await this.notifications.sendCancelled({
      id: order.id,
      orderNumber: order.orderNumber,
      contact: { email: order.customerEmail },
      cancelReason: order.cancelReason,
      refunds: order.refunds.map((refund) => ({
        status: refund.status,
        amount: refund.amount.toString(),
      })),
    });
  }
}

interface CancellationOrderRecord extends OrderOwnershipRecord {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: string;
  fulfillmentStatus: string;
  shipments: Array<{ status: string }>;
}

async function loadCancellationOrder(
  orderId: string,
  transaction: Prisma.TransactionClient,
): Promise<CancellationOrderRecord | null> {
  const order = await transaction.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      sourceCartId: true,
      customerId: true,
      guestAccessTokenHash: true,
      status: true,
      fulfillmentType: true,
      fulfillmentStatus: true,
    },
  });
  if (order === null) return null;
  const sourceCart = await transaction.cart.findUnique({
    where: { id: order.sourceCartId },
    select: { status: true, guestTokenHash: true, expiresAt: true },
  });
  if (sourceCart === null) return null;
  return { ...order, sourceCart, shipments: [] };
}

function assertCancellationAllowed(
  order: {
    status: string;
    fulfillmentType: string;
    fulfillmentStatus: string;
    shipments: ReadonlyArray<{ status: string }>;
  },
  kind: CancellationKind,
): void {
  if (!['PLACED', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  const returnedStaffCancellation =
    kind === 'STAFF' &&
    order.fulfillmentType === 'SHIPPING' &&
    order.fulfillmentStatus === 'RETURNED' &&
    order.shipments.some(({ status }) => status === 'RETURNED');
  if (returnedStaffCancellation) return;
  if (
    !['PENDING', 'PREPARING', 'READY'].includes(order.fulfillmentStatus) ||
    order.shipments.some(({ status }) =>
      ['HANDED_TO_CARRIER', 'DELIVERED', 'FAILED', 'RETURNED'].includes(status),
    )
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
}

async function lockShipments(
  orderId: string,
  transaction: Prisma.TransactionClient,
): Promise<Array<{ status: string }>> {
  const shipments = await transaction.shipment.findMany({
    where: { orderId },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const { id } of shipments) {
    await transaction.$queryRaw`SELECT id FROM shipments WHERE id = ${id}::uuid FOR UPDATE`;
  }
  return transaction.shipment.findMany({
    where: { orderId },
    select: { status: true },
    orderBy: { id: 'asc' },
  });
}

function ownerAuditActor(request: Request): AuditWriteActorContext {
  const context = requestContext(request);
  return request.auth === undefined
    ? { ...context, actorType: 'GUEST' }
    : { ...context, actorUserId: request.auth.userId };
}
