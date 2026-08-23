import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, StockMovement } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type {
  AdjustStockDto,
  ReceiveStockDto,
  ReturnStockDto,
  StockLevelListQueryDto,
  StockMovementListQueryDto,
  TransferStockDto,
} from './stock.dto.js';
import type {
  StockCommandResultDto,
  StockLevelDto,
  StockMovementDto,
} from './stock-response.dto.js';
import { StockRepository, type StockLevelRecord } from './stock.repository.js';

@Injectable()
export class StockService {
  public constructor(
    @Inject(StockRepository) private readonly repository: StockRepository,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async listLevels(query: StockLevelListQueryDto) {
    const result = await this.repository.listLevels(query);
    return new PaginatedApiResult(result.items.map(toStockLevel), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    });
  }

  public async listMovements(query: StockMovementListQueryDto) {
    const result = await this.repository.listMovements(query);
    return new PaginatedApiResult(result.items.map(toMovement), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    });
  }

  public async receive(input: ReceiveStockDto, actor: AuditActorContext) {
    return this.transactions.run('inventory.stock.receive', async (transaction) => {
      await assertStockTarget(transaction, input.variantId, [input.locationId]);
      const level = await this.repository.ensureLevel(
        input.variantId,
        input.locationId,
        transaction,
      );
      await this.repository.lockLevels([level.id], transaction);
      const updated = await this.repository.updateLevel(
        level.id,
        { quantityOnHand: { increment: input.quantity } },
        transaction,
      );
      const movement = await this.repository.createMovement(
        {
          variantId: input.variantId,
          toLocationId: input.locationId,
          type: 'RECEIPT',
          quantity: input.quantity,
          createdById: actor.actorUserId,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        },
        transaction,
      );
      await auditMovement(this.audit, transaction, actor, movement, [updated]);
      return commandResult(movement, [updated]);
    });
  }

  public async transfer(input: TransferStockDto, actor: AuditActorContext) {
    if (input.fromLocationId === input.toLocationId) {
      throw validation('toLocationId', 'TRANSFER_LOCATIONS_MUST_DIFFER');
    }
    return this.transactions.run('inventory.stock.transfer', async (transaction) => {
      await assertStockTarget(transaction, input.variantId, [
        input.fromLocationId,
        input.toLocationId,
      ]);
      const seededLevels = new Map<string, { id: string }>();
      for (const locationId of [input.fromLocationId, input.toLocationId].sort()) {
        seededLevels.set(
          locationId,
          await this.repository.ensureLevel(input.variantId, locationId, transaction),
        );
      }
      const sourceSeed = seededLevels.get(input.fromLocationId);
      const targetSeed = seededLevels.get(input.toLocationId);
      if (sourceSeed === undefined || targetSeed === undefined) {
        throw new ApiError('INTERNAL_ERROR');
      }
      await this.repository.lockLevels([sourceSeed.id, targetSeed.id], transaction);
      const source = await this.repository.findLevel(
        input.variantId,
        input.fromLocationId,
        transaction,
      );
      if (source === null || source.quantityOnHand - source.quantityReserved < input.quantity) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
      const updatedSource = await this.repository.updateLevel(
        sourceSeed.id,
        { quantityOnHand: { decrement: input.quantity } },
        transaction,
      );
      const updatedTarget = await this.repository.updateLevel(
        targetSeed.id,
        { quantityOnHand: { increment: input.quantity } },
        transaction,
      );
      const movement = await this.repository.createMovement(
        {
          variantId: input.variantId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          type: 'TRANSFER',
          quantity: input.quantity,
          createdById: actor.actorUserId,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        },
        transaction,
      );
      await auditMovement(this.audit, transaction, actor, movement, [updatedSource, updatedTarget]);
      return commandResult(movement, [updatedSource, updatedTarget]);
    });
  }

  public async adjust(input: AdjustStockDto, actor: AuditActorContext) {
    return this.transactions.run('inventory.stock.adjust', async (transaction) => {
      await assertStockTarget(transaction, input.variantId, [input.locationId]);
      const seed = await this.repository.ensureLevel(
        input.variantId,
        input.locationId,
        transaction,
      );
      await this.repository.lockLevels([seed.id], transaction);
      const current = await this.repository.findLevel(
        input.variantId,
        input.locationId,
        transaction,
      );
      if (
        current === null ||
        (input.direction === 'OUT' &&
          current.quantityOnHand - current.quantityReserved < input.quantity)
      ) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
      const updated = await this.repository.updateLevel(
        seed.id,
        {
          quantityOnHand:
            input.direction === 'IN'
              ? { increment: input.quantity }
              : { decrement: input.quantity },
        },
        transaction,
      );
      const movement = await this.repository.createMovement(
        {
          variantId: input.variantId,
          ...(input.direction === 'IN'
            ? { toLocationId: input.locationId, type: 'ADJUSTMENT_IN' as const }
            : { fromLocationId: input.locationId, type: 'ADJUSTMENT_OUT' as const }),
          quantity: input.quantity,
          reason: input.reason,
          createdById: actor.actorUserId,
        },
        transaction,
      );
      await auditMovement(this.audit, transaction, actor, movement, [updated]);
      return commandResult(movement, [updated]);
    });
  }

  public async returnStock(input: ReturnStockDto, actor: AuditActorContext) {
    return this.transactions.run(
      'inventory.stock.return',
      async (transaction) => {
        await assertStockTarget(transaction, input.variantId, [input.locationId]);
        const seed = await this.repository.ensureLevel(
          input.variantId,
          input.locationId,
          transaction,
        );
        await this.repository.lockLevels([seed.id], transaction);
        if (input.referenceType === 'SHIPMENT') {
          const current = await this.repository.findLevel(
            input.variantId,
            input.locationId,
            transaction,
          );
          if (current === null) throw new ApiError('INTERNAL_ERROR');
          const existing = await this.repository.findShipmentReturn(
            input.referenceId,
            input.variantId,
            transaction,
          );
          if (existing !== null) {
            if (
              existing.toLocationId === input.locationId &&
              existing.quantity === input.quantity &&
              existing.reason?.trim() === input.reason.trim()
            ) {
              return commandResult(existing, [current]);
            }
            throw new ApiError('DUPLICATE_RESOURCE');
          }
          await assertShipmentReturnReference(transaction, input);
        }
        const updated = await this.repository.updateLevel(
          seed.id,
          { quantityOnHand: { increment: input.quantity } },
          transaction,
        );
        const movement = await this.repository.createMovement(
          {
            variantId: input.variantId,
            toLocationId: input.locationId,
            type: 'RETURN',
            quantity: input.quantity,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            reason: input.reason,
            createdById: actor.actorUserId,
          },
          transaction,
        );
        await auditMovement(this.audit, transaction, actor, movement, [updated]);
        return commandResult(movement, [updated]);
      },
      (error) => input.referenceType === 'SHIPMENT' && isUniqueError(error),
    );
  }
}

async function assertShipmentReturnReference(
  transaction: Prisma.TransactionClient,
  input: ReturnStockDto,
): Promise<void> {
  const shipment = await transaction.shipment.findUnique({
    where: { id: input.referenceId },
    select: {
      status: true,
      returnedToLocationId: true,
      returnedToLocation: { select: { status: true, type: true } },
      order: {
        select: {
          fulfillmentType: true,
          fulfillmentStatus: true,
          items: {
            where: { variantId: input.variantId, inventoryUnitId: null },
            select: { quantity: true },
          },
        },
      },
    },
  });
  if (shipment === null) throw new ApiError('RESOURCE_NOT_FOUND');
  if (
    shipment.status !== 'RETURNED' ||
    shipment.order.fulfillmentType !== 'SHIPPING' ||
    shipment.order.fulfillmentStatus !== 'RETURNED' ||
    shipment.returnedToLocationId !== input.locationId ||
    shipment.returnedToLocation?.status !== 'ACTIVE' ||
    !isReturnLocationType(shipment.returnedToLocation.type) ||
    !shipment.order.items.some(({ quantity }) => quantity === input.quantity)
  ) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function isReturnLocationType(value: string): boolean {
  return value === 'STORE' || value === 'WAREHOUSE';
}

async function assertStockTarget(
  transaction: Prisma.TransactionClient,
  variantId: string,
  locationIds: string[],
): Promise<void> {
  // A transaction client owns one PostgreSQL connection; keep its queries sequential.
  const variant = await transaction.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });
  const locations = await transaction.inventoryLocation.findMany({
    where: { id: { in: locationIds } },
  });
  if (variant === null || locations.length !== new Set(locationIds).size) {
    throw new ApiError('RESOURCE_NOT_FOUND');
  }
  if (
    variant.product.type !== 'ACCESSORY' ||
    variant.inventoryMode !== 'QUANTITY' ||
    variant.status === 'ARCHIVED' ||
    variant.product.status === 'ARCHIVED' ||
    locations.some((location) => location.status !== 'ACTIVE')
  ) {
    throw validation('variantId', 'INVALID_STOCK_TARGET');
  }
}

function commandResult(movement: StockMovement, levels: StockLevelRecord[]): StockCommandResultDto {
  return { movement: toMovement(movement), affectedLevels: levels.map(toStockLevel) };
}

function toStockLevel(level: StockLevelRecord): StockLevelDto {
  const quantityAvailable = level.quantityOnHand - level.quantityReserved;
  return {
    id: level.id,
    variant: {
      id: level.variant.id,
      sku: level.variant.sku,
      displayName: level.variant.displayName,
      status: level.variant.status,
    },
    location: {
      id: level.location.id,
      code: level.location.code,
      name: level.location.name,
      type: level.location.type,
      status: level.location.status,
    },
    quantityOnHand: level.quantityOnHand,
    quantityReserved: level.quantityReserved,
    quantityAvailable,
    reorderThreshold: level.reorderThreshold,
    lowStock: quantityAvailable <= level.reorderThreshold,
    updatedAt: level.updatedAt,
  };
}

function toMovement(movement: StockMovement): StockMovementDto {
  return {
    id: movement.id,
    variantId: movement.variantId,
    fromLocationId: movement.fromLocationId,
    toLocationId: movement.toLocationId,
    type: movement.type,
    quantity: movement.quantity,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    reason: movement.reason,
    createdById: movement.createdById,
    createdAt: movement.createdAt,
  };
}

function auditMovement(
  audit: AuditWriter,
  transaction: Prisma.TransactionClient,
  actor: AuditActorContext,
  movement: StockMovement,
  levels: StockLevelRecord[],
) {
  return audit.write(transaction, actor, {
    action: `inventory.stock.${movement.type.toLowerCase()}`,
    resourceType: 'StockMovement',
    resourceId: movement.id,
    changes: {
      movement: { type: movement.type, quantity: movement.quantity },
      levels: levels.map((level) => ({
        id: level.id,
        quantityOnHand: level.quantityOnHand,
        quantityReserved: level.quantityReserved,
      })),
    },
    ...(movement.reason === null ? {} : { metadata: { reason: movement.reason } }),
  });
}

function validation(field: string, code: string): ApiError {
  return new ApiError('VALIDATION_FAILED', undefined, [{ field, code, message: code }]);
}
