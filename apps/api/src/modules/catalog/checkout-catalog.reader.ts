import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface CheckoutCartLineTarget {
  cartItemId: string;
  variantId: string;
  inventoryUnitId: string | null;
  quantity: number;
}

export interface CheckoutCatalogLine {
  cartItemId: string;
  itemType: 'IPHONE' | 'ACCESSORY';
  productId: string;
  productType: 'IPHONE' | 'ACCESSORY';
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  inventoryUnitId: string | null;
  inventoryCode: string | null;
  unitLocationId: string | null;
  quantity: number;
  unitPrice: string;
  configurationSnapshot: Prisma.InputJsonValue;
  warrantyDaysOverride: number | null;
  variantWarranty: CheckoutWarrantyPolicy | null;
  productWarranty: CheckoutWarrantyPolicy | null;
}

export interface CheckoutWarrantyPolicy {
  days: number;
  terms: string;
}

@Injectable()
export class CheckoutCatalogReader {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async readLines(
    targets: readonly CheckoutCartLineTarget[],
    transaction: Prisma.TransactionClient,
  ): Promise<CheckoutCatalogLine[]> {
    const variantIds = [...new Set(targets.map(({ variantId }) => variantId))];
    const unitIds = targets.flatMap(({ inventoryUnitId }) =>
      inventoryUnitId === null ? [] : [inventoryUnitId],
    );
    const variants = await transaction.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        sku: true,
        displayName: true,
        storageCapacityGb: true,
        colorName: true,
        colorHex: true,
        inventoryMode: true,
        salePrice: true,
        accessoryAttributes: true,
        status: true,
        archivedAt: true,
        warrantyPolicy: {
          select: { defaultDays: true, terms: true, status: true, archivedAt: true },
        },
        product: {
          select: {
            id: true,
            type: true,
            name: true,
            status: true,
            archivedAt: true,
            warrantyPolicy: {
              select: { defaultDays: true, terms: true, status: true, archivedAt: true },
            },
          },
        },
      },
    });
    const units =
      unitIds.length === 0
        ? []
        : await transaction.inventoryUnit.findMany({
            where: { id: { in: unitIds } },
            select: {
              id: true,
              variantId: true,
              locationId: true,
              inventoryCode: true,
              lifecycleStatus: true,
              salePrice: true,
              warrantyDaysOverride: true,
              modelNumber: true,
              regionCode: true,
              simLockStatus: true,
              simConfiguration: true,
              inspections: {
                where: { status: 'COMPLETED', isCurrent: true, overallResult: 'PASSED' },
                select: { batteryHealthPercent: true, conditionGrade: true },
                take: 1,
              },
            },
          });
    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const unitMap = new Map(units.map((unit) => [unit.id, unit]));

    return targets.map((target) => {
      const variant = variantMap.get(target.variantId);
      if (
        variant === undefined ||
        variant.status !== 'ACTIVE' ||
        variant.archivedAt !== null ||
        variant.product.status !== 'ACTIVE' ||
        variant.product.archivedAt !== null
      ) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
      const variantWarranty = activeWarranty(variant.warrantyPolicy);
      const productWarranty = activeWarranty(variant.product.warrantyPolicy);

      if (target.inventoryUnitId === null) {
        if (
          variant.inventoryMode !== 'QUANTITY' ||
          variant.product.type !== 'ACCESSORY' ||
          variant.salePrice === null
        ) {
          throw new ApiError('INVENTORY_NOT_AVAILABLE');
        }
        return {
          cartItemId: target.cartItemId,
          itemType: 'ACCESSORY',
          productId: variant.product.id,
          productType: 'ACCESSORY',
          productName: variant.product.name,
          variantId: variant.id,
          variantName: variant.displayName,
          sku: variant.sku,
          inventoryUnitId: null,
          inventoryCode: null,
          unitLocationId: null,
          quantity: target.quantity,
          unitPrice: variant.salePrice.toString(),
          configurationSnapshot: compactJson({
            storageCapacityGb: variant.storageCapacityGb,
            colorName: variant.colorName,
            colorHex: variant.colorHex,
            accessoryAttributes: variant.accessoryAttributes,
          }),
          warrantyDaysOverride: null,
          variantWarranty,
          productWarranty,
        };
      }

      const unit = unitMap.get(target.inventoryUnitId);
      if (
        unit === undefined ||
        unit.variantId !== variant.id ||
        unit.lifecycleStatus !== 'AVAILABLE' ||
        unit.salePrice === null ||
        unit.inspections.length !== 1 ||
        variant.inventoryMode !== 'SERIALIZED' ||
        variant.product.type !== 'IPHONE' ||
        target.quantity !== 1
      ) {
        throw new ApiError('INVENTORY_NOT_AVAILABLE');
      }
      const inspection = unit.inspections[0];
      return {
        cartItemId: target.cartItemId,
        itemType: 'IPHONE',
        productId: variant.product.id,
        productType: 'IPHONE',
        productName: variant.product.name,
        variantId: variant.id,
        variantName: variant.displayName,
        sku: variant.sku,
        inventoryUnitId: unit.id,
        inventoryCode: unit.inventoryCode,
        unitLocationId: unit.locationId,
        quantity: 1,
        unitPrice: unit.salePrice.toString(),
        configurationSnapshot: compactJson({
          storageCapacityGb: variant.storageCapacityGb,
          colorName: variant.colorName,
          colorHex: variant.colorHex,
          modelNumber: unit.modelNumber,
          regionCode: unit.regionCode,
          simLockStatus: unit.simLockStatus,
          simConfiguration: unit.simConfiguration,
          batteryHealthPercent: inspection?.batteryHealthPercent ?? null,
          conditionGrade: inspection?.conditionGrade ?? null,
        }),
        warrantyDaysOverride: unit.warrantyDaysOverride,
        variantWarranty,
        productWarranty,
      };
    });
  }
}

function activeWarranty(
  policy: { defaultDays: number; terms: string; status: string; archivedAt: Date | null } | null,
): CheckoutWarrantyPolicy | null {
  return policy !== null && policy.status === 'ACTIVE' && policy.archivedAt === null
    ? { days: policy.defaultDays, terms: policy.terms }
    : null;
}

function compactJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined),
  ) as Prisma.InputJsonObject;
}
