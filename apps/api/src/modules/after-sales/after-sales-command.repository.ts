import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  AfterSalesResolution,
  AfterSalesStatus,
  AfterSalesType,
  Prisma,
} from '../../generated/prisma/client.js';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface AfterSalesCommandRecord {
  id: string;
  requestNumber: string;
  warrantyId: string | null;
  orderItemId: string;
  customerId: string | null;
  type: AfterSalesType;
  status: AfterSalesStatus;
  assignedToId: string | null;
  receivedLocationId: string | null;
  receivedById: string | null;
  receiveNote: string | null;
  inspectionSummary: string | null;
  inventoryInspectionId: string | null;
  decisionNote: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  resolutionType: AfterSalesResolution | null;
  resolutionNote: string | null;
  replacementInventoryUnitId: string | null;
  refundId: string | null;
  resolvedById: string | null;
  returnNote: string | null;
  requestedAt: Date;
  receivedAt: Date | null;
  inspectedAt: Date | null;
  resolvedAt: Date | null;
  returnedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
}

export interface AfterSalesResolutionUpdate {
  resolutionType: AfterSalesResolution;
  resolutionNote: string;
  resolvedById: string;
  resolvedAt: Date;
  replacementInventoryUnitId?: string;
  refundId?: string;
  returnNote?: string;
  returnedAt?: Date;
}

@Injectable()
export class AfterSalesCommandRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findOrderItemId(id: string, client: DbClient = this.prisma) {
    return client.afterSalesRequest.findUnique({
      where: { id },
      select: { orderItemId: true },
    });
  }

  public findActiveEmployee(id: string, transaction: Prisma.TransactionClient) {
    return transaction.user.findFirst({
      where: { id, role: 'EMPLOYEE', status: 'ACTIVE' },
      select: { id: true },
    });
  }

  public async lockById(
    id: string,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord | null> {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM after_sales_requests
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    if (locked.length !== 1) return null;
    return this.findById(id, transaction);
  }

  public async findById(
    id: string,
    client: DbClient = this.prisma,
  ): Promise<AfterSalesCommandRecord | null> {
    const rows = await client.$queryRaw<AfterSalesCommandRecord[]>`
      SELECT
        id,
        request_number AS "requestNumber",
        warranty_id AS "warrantyId",
        order_item_id AS "orderItemId",
        customer_id AS "customerId",
        type,
        status,
        assigned_to_id AS "assignedToId",
        received_location_id AS "receivedLocationId",
        received_by_id AS "receivedById",
        receive_note AS "receiveNote",
        inspection_summary AS "inspectionSummary",
        inventory_inspection_id AS "inventoryInspectionId",
        decision_note AS "decisionNote",
        decided_by_id AS "decidedById",
        decided_at AS "decidedAt",
        resolution_type AS "resolutionType",
        resolution_note AS "resolutionNote",
        replacement_inventory_unit_id AS "replacementInventoryUnitId",
        refund_id AS "refundId",
        resolved_by_id AS "resolvedById",
        return_note AS "returnNote",
        requested_at AS "requestedAt",
        received_at AS "receivedAt",
        inspected_at AS "inspectedAt",
        resolved_at AS "resolvedAt",
        returned_at AS "returnedAt",
        cancelled_at AS "cancelledAt",
        updated_at AS "updatedAt"
      FROM after_sales_requests
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  public async assign(
    id: string,
    employeeId: string | null,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    const updated = await transaction.afterSalesRequest.updateMany({
      where: {
        id,
        status: { in: ['REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED'] },
      },
      data: { assignedToId: employeeId, updatedAt: now },
    });
    return this.requireUpdated(id, updated.count, transaction);
  }

  public async receive(
    input: {
      id: string;
      receivedLocationId: string;
      receivedById: string;
      receiveNote: string | null;
      receivedAt: Date;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    const count = await transaction.$executeRaw`
      UPDATE after_sales_requests
      SET
        status = 'RECEIVED',
        received_location_id = ${input.receivedLocationId}::uuid,
        received_by_id = ${input.receivedById}::uuid,
        receive_note = ${input.receiveNote},
        received_at = ${input.receivedAt},
        updated_at = ${input.receivedAt}
      WHERE id = ${input.id}::uuid AND status = 'REQUESTED'
    `;
    return this.requireUpdated(input.id, count, transaction);
  }

  public async startInspection(
    input: { id: string; inventoryInspectionId: string | null; inspectedAt: Date },
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    const updated = await transaction.afterSalesRequest.updateMany({
      where: { id: input.id, status: 'RECEIVED' },
      data: {
        status: 'INSPECTING',
        inventoryInspectionId: input.inventoryInspectionId,
        inspectedAt: input.inspectedAt,
        updatedAt: input.inspectedAt,
      },
    });
    return this.requireUpdated(input.id, updated.count, transaction);
  }

  public async recordInspectionSummary(
    id: string,
    inspectionSummary: string,
    now: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    const updated = await transaction.afterSalesRequest.updateMany({
      where: { id, status: 'INSPECTING' },
      data: { inspectionSummary, updatedAt: now },
    });
    return this.requireUpdated(id, updated.count, transaction);
  }

  public async approve(
    input: { id: string; note: string; actorUserId: string; decidedAt: Date },
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    const updated = await transaction.afterSalesRequest.updateMany({
      where: { id: input.id, status: 'INSPECTING' },
      data: {
        status: 'APPROVED',
        decisionNote: input.note,
        decidedById: input.actorUserId,
        decidedAt: input.decidedAt,
        updatedAt: input.decidedAt,
      },
    });
    return this.requireUpdated(input.id, updated.count, transaction);
  }

  public async reject(
    input: {
      id: string;
      reason: string;
      actorUserId: string;
      decidedAt: Date;
      returnNote: string | null;
      returnedAt: Date | null;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    const updated = await transaction.afterSalesRequest.updateMany({
      where: { id: input.id, status: 'INSPECTING' },
      data: {
        status: 'REJECTED',
        decisionNote: input.reason,
        decidedById: input.actorUserId,
        decidedAt: input.decidedAt,
        returnNote: input.returnNote,
        returnedAt: input.returnedAt,
        updatedAt: input.decidedAt,
      },
    });
    return this.requireUpdated(input.id, updated.count, transaction);
  }

  public async resolve(
    id: string,
    input: AfterSalesResolutionUpdate,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    const updated = await transaction.afterSalesRequest.updateMany({
      where: { id, status: 'APPROVED' },
      data: {
        status: 'RESOLVED',
        resolutionType: input.resolutionType,
        resolutionNote: input.resolutionNote,
        resolvedById: input.resolvedById,
        resolvedAt: input.resolvedAt,
        replacementInventoryUnitId: input.replacementInventoryUnitId ?? null,
        refundId: input.refundId ?? null,
        returnNote: input.returnNote ?? null,
        returnedAt: input.returnedAt ?? null,
        updatedAt: input.resolvedAt,
      },
    });
    return this.requireUpdated(id, updated.count, transaction);
  }

  private async requireUpdated(
    id: string,
    count: number,
    transaction: Prisma.TransactionClient,
  ): Promise<AfterSalesCommandRecord> {
    if (count !== 1) throw new ApiError('CONCURRENT_MODIFICATION');
    const record = await this.findById(id, transaction);
    if (record === null) throw new ApiError('INTERNAL_ERROR');
    return record;
  }
}
