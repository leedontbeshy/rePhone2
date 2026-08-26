import type { components } from '@rephone/api-client';
import type { ProductDetail } from './catalog-api';
import { isIphoneVariant } from './catalog-api';

type UsedIphoneCard = components['schemas']['UsedIphoneCardDto'];

export type ModelUnitOfferSort = 'BATTERY_DESC' | 'PRICE_ASC' | 'PRICE_DESC';

export interface ModelUnitOffer {
  readonly colorHex: string | null | undefined;
  readonly colorName: string | null | undefined;
  readonly productRamGb: number | null | undefined;
  readonly storageCapacityGb: number | null | undefined;
  readonly unit: UsedIphoneCard;
  readonly variantDisplayName: string;
  readonly variantId: string;
}

export function toModelUnitOfferSort(
  value: string | readonly string[] | undefined,
): ModelUnitOfferSort {
  const candidate = typeof value === 'string' ? value : value?.[0];
  return candidate === 'BATTERY_DESC' || candidate === 'PRICE_DESC' ? candidate : 'PRICE_ASC';
}

export function toModelUnitOffers(product: ProductDetail): readonly ModelUnitOffer[] {
  return product.variants.flatMap((variant) => {
    if (!isIphoneVariant(variant)) return [];

    return variant.availableUnits.map((unit) => ({
      colorHex: variant.colorHex,
      colorName: variant.colorName,
      productRamGb: product.ramGb,
      storageCapacityGb: variant.storageCapacityGb,
      unit,
      variantDisplayName: variant.displayName,
      variantId: variant.id,
    }));
  });
}

export function sortModelUnitOffers(
  offers: readonly ModelUnitOffer[],
  sort: ModelUnitOfferSort,
): readonly ModelUnitOffer[] {
  return [...offers].sort((left, right) => {
    const comparison = compareOffers(left, right, sort);
    return comparison === 0
      ? left.unit.inventoryCode.localeCompare(right.unit.inventoryCode, 'vi')
      : comparison;
  });
}

function compareOffers(
  left: ModelUnitOffer,
  right: ModelUnitOffer,
  sort: ModelUnitOfferSort,
): number {
  switch (sort) {
    case 'PRICE_ASC':
      return compareMoney(left.unit.price.salePrice, right.unit.price.salePrice);
    case 'PRICE_DESC':
      return compareMoney(right.unit.price.salePrice, left.unit.price.salePrice);
    case 'BATTERY_DESC':
      return compareNullableNumberDescending(
        left.unit.batteryHealthPercent,
        right.unit.batteryHealthPercent,
      );
  }
}

function compareMoney(left: string, right: string): number {
  const leftAmount = BigInt(left);
  const rightAmount = BigInt(right);
  return leftAmount < rightAmount ? -1 : leftAmount > rightAmount ? 1 : 0;
}

function compareNullableNumberDescending(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  if (left === null || left === undefined) {
    return right === null || right === undefined ? 0 : 1;
  }
  if (right === null || right === undefined) return -1;
  return right - left;
}
