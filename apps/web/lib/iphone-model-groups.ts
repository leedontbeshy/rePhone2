import type { ProductListItem, PublicMedia } from './catalog-api';

export interface IphoneModelSummary {
  readonly coverMedia?: PublicMedia;
  readonly fromPrice?: string;
  readonly id: string;
  readonly inStock: boolean;
  readonly name: string;
  readonly slug: string;
}

export interface IphoneGenerationGroup {
  readonly id: string;
  readonly label: string;
  readonly products: readonly IphoneModelSummary[];
}

interface ModelPlacement {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly groupRank: number;
  readonly modelRank: number;
}

const FALLBACK_GROUP: ModelPlacement = {
  groupId: 'iphone-other',
  groupLabel: 'Dòng iPhone khác',
  groupRank: -1,
  modelRank: Number.MAX_SAFE_INTEGER,
};

const modelNameCollator = new Intl.Collator('vi-VN', {
  numeric: true,
  sensitivity: 'base',
});

export function groupIphoneModels(
  products: readonly ProductListItem[],
): readonly IphoneGenerationGroup[] {
  const grouped = new Map<
    string,
    { label: string; rank: number; products: IphoneModelSummary[] }
  >();

  for (const product of products) {
    if (product.productType !== 'IPHONE') continue;

    const placement = placeModel(product.name);
    const current = grouped.get(placement.groupId) ?? {
      label: placement.groupLabel,
      rank: placement.groupRank,
      products: [],
    };
    current.products.push(toIphoneModelSummary(product));
    grouped.set(placement.groupId, current);
  }

  return [...grouped.entries()]
    .sort(([, left], [, right]) => right.rank - left.rank)
    .map(([id, group]) => ({
      id,
      label: group.label,
      products: group.products.sort(compareModels),
    }));
}

export function toIphoneModelSummary(product: ProductListItem): IphoneModelSummary {
  return {
    id: product.id,
    inStock: product.inStock,
    name: product.name,
    slug: product.slug,
    ...(product.coverMedia === undefined ? {} : { coverMedia: product.coverMedia }),
    ...(product.price.fromPrice === undefined ? {} : { fromPrice: product.price.fromPrice }),
  };
}

function compareModels(left: IphoneModelSummary, right: IphoneModelSummary): number {
  const leftPlacement = placeModel(left.name);
  const rightPlacement = placeModel(right.name);
  const rankDifference = leftPlacement.modelRank - rightPlacement.modelRank;
  return rankDifference === 0 ? modelNameCollator.compare(left.name, right.name) : rankDifference;
}

function placeModel(name: string): ModelPlacement {
  const normalized = name.trim().replace(/\s+/g, ' ');

  if (/^iphone air$/i.test(normalized)) {
    return numericPlacement(17, 'air');
  }

  const numeric = /^iphone\s+(\d{1,2})(.*)$/i.exec(normalized);
  if (numeric !== null) {
    const generation = Number(numeric[1]);
    return numericPlacement(generation, numeric[2]?.trim().toLowerCase() ?? '');
  }

  const xFamily = /^iphone\s+(x|xr|xs|xs\s+max)$/i.exec(normalized);
  if (xFamily !== null) {
    const member = xFamily[1]?.toLowerCase().replace(/\s+/g, ' ') ?? 'x';
    return {
      groupId: 'iphone-x',
      groupLabel: 'iPhone X',
      groupRank: 1_050,
      modelRank: xFamilyRank(member),
    };
  }

  const seFamily = /^iphone\s+se(?:\s*\((?:thế hệ|generation)\s*(\d+)\)|\s+(\d+))?$/i.exec(
    normalized,
  );
  if (seFamily !== null) {
    const generation = Number(seFamily[1] ?? seFamily[2] ?? 1);
    return {
      groupId: 'iphone-se',
      groupLabel: 'iPhone SE',
      groupRank: 0,
      modelRank: 100 - generation,
    };
  }

  return FALLBACK_GROUP;
}

function numericPlacement(generation: number, suffix: string): ModelPlacement {
  return {
    groupId: `iphone-${String(generation)}`,
    groupLabel: `iPhone ${String(generation)}`,
    groupRank: generation * 100,
    modelRank: numericFamilyRank(generation, suffix),
  };
}

function numericFamilyRank(generation: number, suffix: string): number {
  if (generation === 5) {
    if (suffix === '') return 0;
    if (suffix === 'c') return 10;
    if (suffix === 's') return 20;
  }

  if (generation === 6) {
    if (suffix === '') return 0;
    if (suffix === 'plus') return 10;
    if (suffix === 's') return 20;
    if (suffix === 's plus') return 30;
  }

  const ranks: Readonly<Record<string, number>> = {
    '': 0,
    mini: 10,
    e: 20,
    plus: 30,
    air: 40,
    pro: 50,
    'pro max': 60,
  };
  return ranks[suffix] ?? 500;
}

function xFamilyRank(member: string): number {
  const ranks: Readonly<Record<string, number>> = {
    x: 0,
    xr: 10,
    xs: 20,
    'xs max': 30,
  };
  return ranks[member] ?? 500;
}
