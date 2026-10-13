import type { ProductListItem } from '@/lib/catalog-api';
import {
  groupIphoneModels,
  type IphoneGenerationGroup,
  type IphoneModelSummary,
} from '@/lib/iphone-model-groups';

const FEATURED_MODEL_SLUGS = ['iphone-17', 'iphone-16', 'iphone-15'] as const;

export interface HomeDiscovery {
  readonly featured: readonly IphoneModelSummary[];
  readonly generations: readonly IphoneGenerationGroup[];
  readonly selectedGeneration: string | null;
  readonly gridProducts: readonly IphoneModelSummary[];
  readonly gridTitle: string;
}

/** Presentation only: public catalog data remains the authority for price and availability. */
export function buildHomeDiscovery(
  products: readonly ProductListItem[],
  generation?: string | readonly string[],
): HomeDiscovery {
  const unique = new Map<string, ProductListItem>();
  for (const product of products) {
    if (product.productType === 'IPHONE' && !unique.has(product.id))
      unique.set(product.id, product);
  }
  const generations = groupIphoneModels([...unique.values()]);
  const ordered = generations.flatMap((group) => group.products);
  const bySlug = new Map(ordered.map((product) => [product.slug, product]));
  const preferred = FEATURED_MODEL_SLUGS.flatMap((slug) => {
    const product = bySlug.get(slug);
    return product === undefined ? [] : [product];
  });
  const preferredIds = new Set(preferred.map((product) => product.id));
  const featured = [
    ...preferred,
    ...ordered.filter((product) => !preferredIds.has(product.id)),
  ].slice(0, 3);
  const featuredIds = new Set(featured.map((product) => product.id));
  const active =
    typeof generation === 'string'
      ? generations.find((group) => group.id === generation)
      : undefined;

  return {
    featured,
    generations,
    selectedGeneration: active?.id ?? null,
    gridProducts: active?.products ?? ordered.filter((product) => !featuredIds.has(product.id)),
    gridTitle: active === undefined ? 'Các dòng iPhone khác' : `Các dòng ${active.label}`,
  };
}
