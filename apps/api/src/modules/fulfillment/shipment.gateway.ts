import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const shipmentInclude = {
  createdBy: { select: { id: true, fullName: true, employeeCode: true } },
  returnedToLocation: { select: { id: true, code: true, name: true, type: true } },
} satisfies Prisma.ShipmentInclude;

export type ShipmentRecord = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;

export interface CreateShipmentRecord {
  orderId: string;
  carrierName: string;
  trackingCode: string;
  trackingUrl: string | null;
  createdById: string;
}

@Injectable()
export class ShipmentGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findOrderId(id: string): Promise<{ orderId: string } | null> {
    return this.prisma.shipment.findUnique({ where: { id }, select: { orderId: true } });
  }

  public findById(
    id: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<ShipmentRecord | null> {
    return client.shipment.findUnique({ where: { id }, include: shipmentInclude });
  }

  public findByOrderId(
    orderId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<ShipmentRecord | null> {
    return client.shipment.findUnique({ where: { orderId }, include: shipmentInclude });
  }

  public async lock(
    id: string,
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<ShipmentRecord | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM shipments
      WHERE id = ${id}::uuid AND order_id = ${orderId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) return null;
    return this.findById(id, transaction);
  }

  public create(input: CreateShipmentRecord, transaction: Prisma.TransactionClient) {
    return transaction.shipment.create({
      data: {
        orderId: input.orderId,
        attemptNumber: 1,
        carrierName: input.carrierName,
        trackingCode: input.trackingCode,
        trackingUrl: input.trackingUrl,
        status: 'CREATED',
        createdById: input.createdById,
      },
      include: shipmentInclude,
    });
  }
}
