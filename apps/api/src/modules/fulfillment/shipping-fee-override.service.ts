import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { FulfillmentInventoryGateway } from '../inventory/fulfillment-inventory.gateway.js';
import { OrderNotificationService } from '../notifications/order-notification.service.js';
import {
  FulfillmentOrderGateway,
  type FulfillmentOrderRecord,
} from '../order-transaction-ports/fulfillment-order.gateway.js';
import { FulfillmentPaymentGateway } from '../payments/fulfillment-payment.gateway.js';
import type { OverrideShippingFeeDto } from './fulfillment.dto.js';
import { FulfillmentClock } from './fulfillment-clock.service.js';
import { projectBackofficeOrderDetail } from './fulfillment.projector.js';
import type { BackofficeOrderDetailDto } from './fulfillment-response.dto.js';

@Injectable()
export class ShippingFeeOverrideService {
  public constructor(
    @Inject(FulfillmentOrderGateway) private readonly orders: FulfillmentOrderGateway,
    @Inject(FulfillmentPaymentGateway) private readonly payments: FulfillmentPaymentGateway,
    @Inject(FulfillmentInventoryGateway)
    private readonly inventory: FulfillmentInventoryGateway,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OrderNotificationService) private readonly notifications: OrderNotificationService,
    @Inject(FulfillmentClock) private readonly clock: FulfillmentClock,
  ) {}

  public async override(
    id: string,
    input: OverrideShippingFeeDto,
    auth: AuthContext,
    request: Request,
  ): Promise<BackofficeOrderDetailDto> {
    const reason = input.reason.trim();
    const requestedFee = BigInt(input.shippingFee);
    const outcome = await this.transactions.run(
      'fulfillment.override-shipping-fee',
      async (transaction) => {
        const order = await this.orders.lock(id, transaction);
        if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
        const now = this.clock.now();
        if (isExactReplay(order, requestedFee, reason, auth.userId, now)) {
          return { orderId: order.id, changed: false };
        }
        assertOverrideable(order);

        const finance = await this.payments.lockFinance(order.id, transaction);
        const projection = this.payments.project(BigInt(order.grandTotal.toString()), finance);
        if (projection.paidAmount !== 0n || projection.refundedAmount !== 0n) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        const deposit = order.payments.filter(
          ({ purpose, method }) => purpose === 'DEPOSIT' && method === 'BANK_TRANSFER',
        );
        if (
          deposit.length !== 1 ||
          deposit[0]?.status !== 'AWAITING_PROOF' ||
          deposit[0].submittedAt !== null ||
          deposit[0].expiresAt === null ||
          now >= deposit[0].expiresAt ||
          deposit[0].reviewedAt !== null ||
          deposit[0].evidenceBucket !== null ||
          deposit[0].evidenceObjectPath !== null ||
          order.payments.some(({ status }) => status !== 'AWAITING_PROOF')
        ) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }

        const baseTotal =
          BigInt(order.subtotal.toString()) -
          BigInt(order.itemDiscountAmount.toString()) -
          BigInt(order.voucherDiscountAmount.toString());
        const grandTotal = baseTotal + requestedFee;
        const currentDeposit = BigInt(order.depositRequired.toString());
        const depositRequired = currentDeposit < grandTotal ? currentDeposit : grandTotal;
        const cancelDeposit = depositRequired === 0n;
        if (cancelDeposit !== (grandTotal === 0n)) throw new ApiError('INTERNAL_ERROR');
        let reservations: Awaited<
          ReturnType<FulfillmentInventoryGateway['lockActiveReservations']>
        > = [];
        if (cancelDeposit) {
          reservations = await this.inventory.lockActiveReservations(order.id, transaction);
          this.inventory.assertReservationTargets(
            reservations,
            order.id,
            order.items,
            order.fulfillmentLocationId,
          );
          if (
            reservations.some(
              ({ holdReason, expiresAt }) => holdReason !== 'DEPOSIT' || expiresAt === null,
            )
          ) {
            throw new ApiError('INVALID_STATE_TRANSITION');
          }
        }

        await this.payments.updateAwaitingDeposit(
          order.id,
          deposit[0].id,
          depositRequired,
          cancelDeposit,
          transaction,
        );
        if (cancelDeposit) {
          await this.inventory.transitionReservationHold(
            reservations,
            'DEPOSIT',
            'FULFILLMENT',
            null,
            transaction,
          );
        }
        const updated = await transaction.order.updateMany({
          where: {
            id: order.id,
            fulfillmentType: 'SHIPPING',
            status: 'PLACED',
            fulfillmentStatus: 'PENDING',
            shippingFee: order.shippingFee,
          },
          data: {
            shippingFee: requestedFee.toString(),
            shippingFeeOverrideReason: reason,
            shippingFeeOverriddenById: auth.userId,
            shippingFeeOverriddenAt: now,
            grandTotal: grandTotal.toString(),
            depositRequired: depositRequired.toString(),
            paidAmount: '0',
            refundedAmount: '0',
            balanceDue: grandTotal.toString(),
            paymentStatus: cancelDeposit ? 'PAID' : 'UNPAID',
            ...(cancelDeposit ? { status: 'CONFIRMED' as const, confirmedAt: now } : {}),
          },
        });
        if (updated.count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
        await this.audit.write(
          transaction,
          { actorUserId: auth.userId, ...requestContext(request) },
          {
            action: 'order.shipping_fee_overridden',
            resourceType: 'Order',
            resourceId: order.id,
            changes: {
              before: {
                shippingFee: order.shippingFee.toString(),
                grandTotal: order.grandTotal.toString(),
                depositRequired: order.depositRequired.toString(),
              },
              after: {
                shippingFee: requestedFee.toString(),
                grandTotal: grandTotal.toString(),
                depositRequired: depositRequired.toString(),
              },
            },
            metadata: { orderNumber: order.orderNumber, reason },
          },
        );
        return { orderId: order.id, changed: true };
      },
    );

    const detail = await this.project(outcome.orderId);
    if (outcome.changed) await this.notifications.sendShippingFeeUpdated(detail);
    return detail;
  }

  private async project(id: string): Promise<BackofficeOrderDetailDto> {
    const order = await this.orders.findById(id);
    if (order === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficeOrderDetail(order, this.clock.now());
  }
}

function assertOverrideable(order: FulfillmentOrderRecord): void {
  if (
    order.fulfillmentType !== 'SHIPPING' ||
    order.status !== 'PLACED' ||
    order.fulfillmentStatus !== 'PENDING' ||
    order.shipments.length !== 0
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
}

function isExactReplay(
  order: FulfillmentOrderRecord,
  requestedFee: bigint,
  reason: string,
  actorUserId: string,
  now: Date,
): boolean {
  const metadataMatches =
    order.fulfillmentType === 'SHIPPING' &&
    BigInt(order.shippingFee.toString()) === requestedFee &&
    order.shippingFeeOverrideReason?.trim() === reason &&
    order.shippingFeeOverriddenById === actorUserId &&
    order.shippingFeeOverriddenAt !== null;
  if (!metadataMatches || order.shipments.length !== 0) return false;
  const deposits = order.payments.filter(
    ({ purpose, method }) => purpose === 'DEPOSIT' && method === 'BANK_TRANSFER',
  );
  if (deposits.length !== 1) return false;
  const deposit = deposits[0];
  if (deposit === undefined || deposit.submittedAt !== null || deposit.reviewedAt !== null) {
    return false;
  }
  if (
    order.status === 'PLACED' &&
    order.fulfillmentStatus === 'PENDING' &&
    deposit.status === 'AWAITING_PROOF' &&
    deposit.expiresAt !== null &&
    now < deposit.expiresAt
  ) {
    return true;
  }
  return (
    order.status === 'CONFIRMED' &&
    order.fulfillmentStatus === 'PENDING' &&
    BigInt(order.grandTotal.toString()) === 0n &&
    deposit.status === 'CANCELLED' &&
    BigInt(deposit.expectedAmount.toString()) === 0n &&
    order.reservations.length === order.items.length &&
    order.reservations.every(
      ({ status, holdReason, expiresAt }) =>
        status === 'ACTIVE' && holdReason === 'FULFILLMENT' && expiresAt === null,
    )
  );
}
