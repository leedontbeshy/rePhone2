import type { components } from '@rephone/api-client';
import type { ProductDetail, UsedIphoneDetail } from '@/lib/catalog-api';
import { isIphoneVariant } from '@/lib/catalog-api';

type IphoneVariant = components['schemas']['IphoneVariantDto'];
type UsedIphoneCard = components['schemas']['UsedIphoneCardDto'];

export interface RelatedUnitOffer {
  readonly unit: UsedIphoneCard;
  readonly variant: IphoneVariant;
}

export function discountPercent(salePrice: string, compareAtPrice?: string): number | null {
  if (compareAtPrice === undefined) return null;
  const sale = BigInt(salePrice);
  const compareAt = BigInt(compareAtPrice);
  if (compareAt <= BigInt(0) || sale >= compareAt) return null;
  return Number(((compareAt - sale) * BigInt(100) + compareAt / BigInt(2)) / compareAt);
}

export function unitConfigurationLabel(detail: UsedIphoneDetail, product: ProductDetail): string {
  const values = [
    detail.variant.storageCapacityGb === null || detail.variant.storageCapacityGb === undefined
      ? null
      : `${String(detail.variant.storageCapacityGb)} GB`,
    product.ramGb === null || product.ramGb === undefined
      ? null
      : `${String(product.ramGb)} GB RAM`,
  ].filter((value): value is string => value !== null);

  return values.length > 0 ? values.join(' · ') : detail.variant.displayName;
}

export function relatedUnitOffers(
  product: ProductDetail,
  currentInventoryCode: string,
  limit = 4,
): readonly RelatedUnitOffer[] {
  return product.variants
    .filter(isIphoneVariant)
    .flatMap((variant) => variant.availableUnits.map((unit) => ({ unit, variant })))
    .filter(({ unit }) => unit.inventoryCode !== currentInventoryCode)
    .slice(0, limit);
}

export function availableColorOffers(
  product: ProductDetail,
  currentVariantId: string,
): readonly RelatedUnitOffer[] {
  const seenColors = new Set<string>();
  const offers: RelatedUnitOffer[] = [];
  const variants = product.variants.filter(isIphoneVariant);
  const currentVariant = variants.find(({ id }) => id === currentVariantId);
  const orderedVariants =
    currentVariant === undefined
      ? variants
      : [currentVariant, ...variants.filter(({ id }) => id !== currentVariantId)];

  for (const variant of orderedVariants) {
    const unit = variant.availableUnits[0];
    const colorKey = (variant.colorName ?? variant.colorHex ?? '')
      .trim()
      .toLocaleLowerCase('vi-VN');
    if (unit === undefined || colorKey.length === 0 || seenColors.has(colorKey)) continue;
    seenColors.add(colorKey);
    offers.push({ unit, variant });
  }

  return offers;
}

export function safeColorHex(value?: string | null): string {
  return value !== null && value !== undefined && /^#[0-9a-f]{6}$/i.test(value) ? value : '#dce4ea';
}
