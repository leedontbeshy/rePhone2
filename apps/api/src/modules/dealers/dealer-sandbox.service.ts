import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Readable } from 'node:stream';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DealerRuntime } from './dealer-runtime.service.js';
import { DealerOrderService } from './dealer-order.service.js';
import { DealerPaymentService } from './dealer-payment.service.js';
import { DealerRefundService } from './dealer-refund.service.js';
import { ShipmentPreparationService } from '../fulfillment/shipment-preparation.service.js';
import { ShipmentFinalizationService } from '../fulfillment/shipment-finalization.service.js';
import { PickupPreparationService } from '../fulfillment/pickup-preparation.service.js';
import { portalActor } from './dealer-portal.controller.js';
import type { DealerSimulationDto } from './dealer.dto.js';

/** Simulator exercises the real commands only in a physically isolated TEST deployment. */
@Injectable()
export class DealerSandboxService {
  public constructor(
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DealerOrderService) private readonly orders: DealerOrderService,
    @Inject(DealerPaymentService) private readonly payments: DealerPaymentService,
    @Inject(DealerRefundService) private readonly refunds: DealerRefundService,
    @Inject(ShipmentPreparationService) private readonly preparation: ShipmentPreparationService,
    @Inject(ShipmentFinalizationService) private readonly finalization: ShipmentFinalizationService,
    @Inject(PickupPreparationService) private readonly ordersPreparation: PickupPreparationService,
  ) {}
  public async simulate(id: string, input: DealerSimulationDto, request: Request) {
    this.runtime.assertSandbox();
    if (request.auth?.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    const auth = request.auth;
    const actor = portalActor(request);
    const order = await this.prisma.order.findFirst({
      where: { id, channel: 'DEALER' },
      include: { shipments: true },
    });
    if (order === null || order.dealerId === null) throw new ApiError('ORDER_NOT_FOUND');
    const reason = `[TEST] ${input.reason}`;
    if (input.action === 'PAYMENT') {
      if (BigInt(order.balanceDue.toString()) > 0n)
        await this.payments.record(
          {
            orderId: id,
            bankAccountKey: 'TEST-SIMULATOR',
            bankReference: `TEST-${id}`,
            receivedAmount: order.balanceDue.toString(),
            receivedAt: order.createdAt.toISOString(),
            reason,
          },
          actor,
        );
    } else if (input.action === 'CANCEL') {
      await this.payments.cancel(id, reason, actor);
    } else if (input.action === 'REFUND') {
      // Use a real reserved refund. Cancellation creates it automatically; no synthetic ledger shortcuts.
      const refund = await this.prisma.refund.findFirst({
        where: {
          orderId: id,
          dealerId: order.dealerId,
          status: { in: ['REQUESTED', 'PROCESSING'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (refund === null)
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'Tạo yêu cầu hoàn hoặc hủy đơn TEST trước khi mô phỏng chi trả.',
        );
      if (refund.status === 'REQUESTED')
        await this.refunds.action(refund.id, { action: 'START', reason }, actor);
      if (refund.transferState === 'NOT_SENT')
        await this.refunds.action(refund.id, { action: 'MARK_SENT', reason }, actor);
      const buffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
        'base64',
      );
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'TEST-refund.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: buffer.length,
        buffer,
        stream: Readable.from(buffer),
        destination: '',
        filename: '',
        path: '',
      };
      await this.refunds.complete(refund.id, file, actor);
    } else {
      if (input.action === 'DELIVER' && order.status === 'COMPLETED') return this.orders.get(id);
      if (order.status === 'CONFIRMED')
        await this.ordersPreparation.startPreparing(id, auth, request);
      const shipment =
        order.shipments[0] ??
        (
          await this.preparation.create(
            id,
            { carrierName: 'TEST carrier', trackingCode: `TEST-${id}` },
            auth,
            request,
          )
        ).shipment;
      if (shipment.status === 'CREATED')
        await this.preparation.handOver(shipment.id, auth, request);
      if (input.action === 'DELIVER')
        await this.finalization.markDelivered(
          shipment.id,
          { confirmCodCollected: false },
          auth,
          request,
        );
      else if (input.action === 'FAIL')
        await this.finalization.markFailed(shipment.id, { reason }, auth, request);
      else if (input.action === 'RETURN') {
        await this.finalization.markReturned(
          shipment.id,
          { reason, returnedToLocationId: order.fulfillmentLocationId },
          auth,
          request,
        );
      }
    }
    return this.orders.get(id);
  }
}
