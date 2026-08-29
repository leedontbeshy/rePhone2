export interface SortableIphoneProduct {
  readonly name: string;
  readonly releaseYear?: number | null;
}

export interface SortableIphoneVariant {
  readonly colorName?: string | null;
  readonly displayName: string;
  readonly sku: string;
  readonly storageCapacityGb?: number | null;
}

const vietnameseCollator = new Intl.Collator('vi', {
  numeric: true,
  sensitivity: 'base',
});

export function orderIphoneProducts<Product extends SortableIphoneProduct>(
  products: readonly Product[],
): Product[] {
  return [...products].sort((left, right) => {
    const releaseOrder = productReleaseYear(right) - productReleaseYear(left);
    if (releaseOrder !== 0) return releaseOrder;

    const generationOrder = iphoneGeneration(right.name) - iphoneGeneration(left.name);
    if (generationOrder !== 0) return generationOrder;

    const tierOrder = iphoneTier(right.name) - iphoneTier(left.name);
    if (tierOrder !== 0) return tierOrder;

    return vietnameseCollator.compare(left.name, right.name);
  });
}

export function orderIphoneVariants<Variant extends SortableIphoneVariant>(
  variants: readonly Variant[],
): Variant[] {
  return [...variants].sort((left, right) => {
    const storageOrder = variantStorage(left) - variantStorage(right);
    if (storageOrder !== 0) return storageOrder;

    const colorOrder = vietnameseCollator.compare(
      left.colorName?.trim() || left.displayName,
      right.colorName?.trim() || right.displayName,
    );
    if (colorOrder !== 0) return colorOrder;

    const nameOrder = vietnameseCollator.compare(left.displayName, right.displayName);
    return nameOrder !== 0 ? nameOrder : vietnameseCollator.compare(left.sku, right.sku);
  });
}

function productReleaseYear(product: SortableIphoneProduct): number {
  if (Number.isInteger(product.releaseYear) && (product.releaseYear ?? 0) > 0) {
    return product.releaseYear ?? 0;
  }
  return estimatedReleaseYear(iphoneGeneration(product.name));
}

function iphoneGeneration(name: string): number {
  const numeric = /\biphone\s+(\d{1,2})(?:e)?\b/i.exec(name)?.[1];
  if (numeric !== undefined) return Number(numeric);
  return /\biphone\s+x(?:r|s)?\b/i.test(name) ? 10 : 0;
}

function iphoneTier(name: string): number {
  if (/\bpro\s+max\b/i.test(name)) return 5;
  if (/\bpro\b/i.test(name)) return 4;
  if (/\bplus\b/i.test(name)) return 3;
  if (/\bmax\b/i.test(name)) return 3;
  if (/\d{1,2}e\b/i.test(name)) return 1.5;
  if (/\bmini\b/i.test(name)) return 1;
  return 2;
}

function estimatedReleaseYear(generation: number): number {
  if (generation >= 11) return 2008 + generation;
  if (generation === 10 || generation === 8) return 2017;
  if (generation === 7) return 2016;
  if (generation === 6) return 2014;
  if (generation === 5) return 2012;
  if (generation === 4) return 2010;
  if (generation === 3) return 2009;
  return 0;
}

function variantStorage(variant: SortableIphoneVariant): number {
  if (typeof variant.storageCapacityGb === 'number' && Number.isFinite(variant.storageCapacityGb)) {
    return variant.storageCapacityGb;
  }
  const storage = /(\d+(?:[.,]\d+)?)\s*(TB|GB)\b/i.exec(variant.displayName);
  if (storage === null) return Number.POSITIVE_INFINITY;
  const amount = Number((storage[1] ?? '').replace(',', '.'));
  return storage[2]?.toUpperCase() === 'TB' ? amount * 1024 : amount;
}
