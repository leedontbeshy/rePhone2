import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import type { ProductListQueryDto } from './catalog.dto.js';
import {
  type AccessoryVariantDto,
  type IphoneVariantDto,
  type ProductDetailDto,
  type ProductListItemDto,
  type PublicMediaDto,
  type UsedIphoneCardDto,
  type UsedIphoneDetailDto,
  type WarrantySummaryDto,
} from './catalog-response.dto.js';
import { projectFunctionalChecks, projectMaskedIdentifiers } from './catalog-projection.js';
import { CatalogRepository, type ProductListItemRecord } from './catalog.repository.js';
import { PublicMediaUrlBuilder, type PublicMediaRecord } from './public-media-url.builder.js';

type ProductRecord = NonNullable<Awaited<ReturnType<CatalogRepository['findPublicProduct']>>>;
type UnitRecord = NonNullable<Awaited<ReturnType<CatalogRepository['findPublicUsedIphone']>>>;
type StoreDefaults = Awaited<ReturnType<CatalogRepository['findStoreWarrantyDefaults']>>;
type WarrantyPolicyRecord = {
  name: string;
  defaultDays: number;
  terms: string;
  status: string;
} | null;

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  public constructor(
    @Inject(CatalogRepository) private readonly repository: CatalogRepository,
    @Inject(PublicMediaUrlBuilder) private readonly mediaUrlBuilder: PublicMediaUrlBuilder,
  ) {}

  public async listProducts(
    query: ProductListQueryDto,
  ): Promise<PaginatedApiResult<ProductListItemDto>> {
    validatePriceRange(query);
    const result = await this.repository.listProducts(query);
    return new PaginatedApiResult(
      result.items.map((item) => this.toListItem(item)),
      {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / query.pageSize),
      },
    );
  }

  public async getProduct(slug: string): Promise<ProductDetailDto> {
    const [product, defaults] = await Promise.all([
      this.repository.findPublicProduct(slug),
      this.repository.findStoreWarrantyDefaults(),
    ]);
    if (product === null) {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }
    return this.toProductDetail(product, defaults);
  }

  public async getUsedIphone(slug: string, inventoryCode: string): Promise<UsedIphoneDetailDto> {
    const [unit, defaults] = await Promise.all([
      this.repository.findPublicUsedIphone(slug, inventoryCode),
      this.repository.findStoreWarrantyDefaults(),
    ]);
    if (unit === null) {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }
    return this.toUsedIphoneDetail(unit, defaults);
  }

  private toListItem(item: ProductListItemRecord): ProductListItemDto {
    const coverMedia =
      item.coverMedia === null ? null : this.mediaUrlBuilder.build(item.coverMedia, item.name);
    return {
      id: item.id,
      slug: item.slug,
      productType: item.productType,
      brand: item.brand,
      name: item.name,
      releaseYear: item.releaseYear,
      ...(coverMedia === null ? {} : { coverMedia }),
      price: {
        ...(item.fromPrice === null ? {} : { fromPrice: item.fromPrice }),
        ...(item.compareAtPrice === null ? {} : { compareAtPrice: item.compareAtPrice }),
      },
      inStock: item.inStock,
      storageOptions: item.storageOptions,
      colorOptions: item.colorOptions,
    };
  }

  private toProductDetail(product: ProductRecord, defaults: StoreDefaults): ProductDetailDto {
    const productMedia = this.projectMedia(product.media, product.name);
    const variants =
      product.type === 'IPHONE'
        ? product.variants
            .filter((variant) => variant.inventoryMode === 'SERIALIZED')
            .map((variant) => this.toIphoneVariant(product, variant, productMedia, defaults))
        : product.variants
            .filter((variant) => variant.inventoryMode === 'QUANTITY')
            .map((variant) => this.toAccessoryVariant(product, variant, productMedia, defaults));
    return {
      id: product.id,
      slug: product.slug,
      productType: product.type,
      brand: product.brand,
      name: product.name,
      description: product.description,
      releaseYear: product.releaseYear,
      chipset: product.chipset,
      ramGb: product.ramGb,
      screenSizeInches: product.screenSizeInches?.toString() ?? null,
      media: productMedia,
      variants,
    };
  }

  private toIphoneVariant(
    product: ProductRecord,
    variant: ProductRecord['variants'][number],
    productMedia: PublicMediaDto[],
    defaults: StoreDefaults,
  ): IphoneVariantDto {
    const variantMedia = this.projectMedia(variant.media, variant.displayName);
    const warranty = effectiveWarranty(variant.warrantyPolicy, product.warrantyPolicy, defaults);
    const availableUnits = variant.inventoryUnits
      .map((unit) =>
        this.toUsedIphoneCard(
          unit,
          variantMedia.length > 0 ? variantMedia : productMedia,
          warranty,
        ),
      )
      .filter((unit): unit is UsedIphoneCardDto => unit !== null);
    return {
      id: variant.id,
      sku: variant.sku,
      displayName: variant.displayName,
      storageCapacityGb: variant.storageCapacityGb,
      colorName: variant.colorName,
      colorHex: variant.colorHex,
      warrantySummary: warranty,
      availableUnits,
    };
  }

  private toAccessoryVariant(
    product: ProductRecord,
    variant: ProductRecord['variants'][number],
    productMedia: PublicMediaDto[],
    defaults: StoreDefaults,
  ): AccessoryVariantDto {
    if (variant.salePrice === null) {
      throw new ApiError('INTERNAL_ERROR');
    }
    const ownMedia = this.projectMedia(variant.media, variant.displayName);
    const pickup = variant.stockLevels.some(
      (stock) =>
        stock.location.type === 'STORE' && stock.quantityOnHand - stock.quantityReserved > 0,
    );
    const shipping = variant.stockLevels.some(
      (stock) => stock.quantityOnHand - stock.quantityReserved > 0,
    );
    return {
      id: variant.id,
      sku: variant.sku,
      displayName: variant.displayName,
      colorName: variant.colorName,
      colorHex: variant.colorHex,
      price: {
        salePrice: variant.salePrice.toString(),
        ...(variant.compareAtPrice === null
          ? {}
          : { compareAtPrice: variant.compareAtPrice.toString() }),
      },
      attributes: sanitizePublicJson(variant.accessoryAttributes),
      warrantySummary: effectiveWarranty(variant.warrantyPolicy, product.warrantyPolicy, defaults),
      media: ownMedia.length > 0 ? ownMedia : productMedia,
      fulfillmentAvailability: { inStock: pickup || shipping, pickup, shipping },
    };
  }

  private toUsedIphoneCard(
    unit: ProductRecord['variants'][number]['inventoryUnits'][number],
    fallbackMedia: PublicMediaDto[],
    warranty: WarrantySummaryDto,
  ): UsedIphoneCardDto | null {
    const inspection = unit.inspections[0];
    const unitMedia = this.projectMedia(unit.media, unit.inventoryCode);
    if (
      inspection === undefined ||
      inspection.conditionGrade === null ||
      projectFunctionalChecks(inspection.checks) === null ||
      unitMedia.length === 0
    ) {
      this.logger.warn({
        event: 'catalog.unit.projection_omitted',
        inventoryCode: unit.inventoryCode,
      });
      return null;
    }
    const media = unitMedia.length > 0 ? unitMedia : fallbackMedia;
    if (unit.salePrice === null) {
      return null;
    }
    return {
      inventoryCode: unit.inventoryCode,
      modelNumber: unit.modelNumber,
      regionCode: unit.regionCode,
      simLockStatus: unit.simLockStatus,
      carrierName: unit.carrierName,
      simConfiguration: unit.simConfiguration,
      price: {
        salePrice: unit.salePrice.toString(),
        ...(unit.compareAtPrice === null ? {} : { compareAtPrice: unit.compareAtPrice.toString() }),
      },
      conditionGrade: inspection.conditionGrade,
      batteryHealthPercent: inspection.batteryHealthPercent,
      repairHistoryStatus: inspection.repairHistoryStatus,
      warrantyDays: unit.warrantyDaysOverride ?? warranty.days,
      ...(media[0] === undefined ? {} : { thumbnail: media[0] }),
      fulfillmentAvailability: {
        pickup: unit.location.type === 'STORE',
        shipping: true,
      },
    };
  }

  private toUsedIphoneDetail(unit: UnitRecord, defaults: StoreDefaults): UsedIphoneDetailDto {
    const inspection = unit.inspections[0];
    const functionalChecks =
      inspection === undefined ? null : projectFunctionalChecks(inspection.checks);
    const ownMedia = this.projectMedia(unit.media, unit.inventoryCode);
    if (
      inspection === undefined ||
      inspection.conditionGrade === null ||
      functionalChecks === null ||
      ownMedia.length === 0 ||
      unit.salePrice === null
    ) {
      throw new ApiError('RESOURCE_NOT_FOUND');
    }
    const variantMedia = this.projectMedia(unit.variant.media, unit.variant.displayName);
    const productMedia = this.projectMedia(unit.variant.product.media, unit.variant.product.name);
    const media =
      ownMedia.length > 0 ? ownMedia : variantMedia.length > 0 ? variantMedia : productMedia;
    const warranty = effectiveWarranty(
      unit.variant.warrantyPolicy,
      unit.variant.product.warrantyPolicy,
      defaults,
    );
    return {
      product: {
        id: unit.variant.product.id,
        slug: unit.variant.product.slug,
        name: unit.variant.product.name,
        brand: unit.variant.product.brand,
      },
      variant: {
        id: unit.variant.id,
        sku: unit.variant.sku,
        displayName: unit.variant.displayName,
        storageCapacityGb: unit.variant.storageCapacityGb,
        colorName: unit.variant.colorName,
        colorHex: unit.variant.colorHex,
      },
      unit: {
        inventoryCode: unit.inventoryCode,
        modelNumber: unit.modelNumber,
        regionCode: unit.regionCode,
        simLockStatus: unit.simLockStatus,
        carrierName: unit.carrierName,
        simConfiguration: unit.simConfiguration,
        price: {
          salePrice: unit.salePrice.toString(),
          ...(unit.compareAtPrice === null
            ? {}
            : { compareAtPrice: unit.compareAtPrice.toString() }),
        },
        conditionGrade: inspection.conditionGrade,
        cosmeticNotes: inspection.cosmeticNotes,
        batteryHealthPercent: inspection.batteryHealthPercent,
        batteryCycleCount: inspection.batteryCycleCount,
        batteryReplacementStatus: inspection.batteryReplacementStatus,
        repairHistoryStatus: inspection.repairHistoryStatus,
        repairNotes: inspection.repairNotes,
        replacedParts: sanitizePublicJson(inspection.replacedParts),
        functionalChecks,
        maskedIdentifiers: projectMaskedIdentifiers(unit),
        warrantyDays: unit.warrantyDaysOverride ?? warranty.days,
        fulfillmentAvailability: {
          pickup: unit.location.type === 'STORE',
          shipping: true,
        },
        media,
      },
    };
  }

  private projectMedia(media: PublicMediaRecord[], fallbackAltText: string): PublicMediaDto[] {
    return media
      .map((item) => this.mediaUrlBuilder.build(item, fallbackAltText))
      .filter((item): item is PublicMediaDto => item !== null);
  }
}

function validatePriceRange(query: ProductListQueryDto): void {
  if (
    query.minPrice !== undefined &&
    query.maxPrice !== undefined &&
    BigInt(query.minPrice) > BigInt(query.maxPrice)
  ) {
    throw new ApiError('VALIDATION_FAILED', undefined, [
      {
        field: 'minPrice',
        code: 'INVALID_RANGE',
        message: 'Giá tối thiểu không được lớn hơn giá tối đa.',
      },
    ]);
  }
}

function effectiveWarranty(
  variantPolicy: WarrantyPolicyRecord,
  productPolicy: WarrantyPolicyRecord,
  defaults: StoreDefaults,
): WarrantySummaryDto {
  const policy = [variantPolicy, productPolicy].find(
    (candidate) => candidate !== null && candidate.status === 'ACTIVE',
  );
  if (policy !== undefined && policy !== null) {
    return { name: policy.name, days: policy.defaultDays, terms: policy.terms };
  }
  return {
    name: 'Bảo hành mặc định',
    days: defaults?.defaultWarrantyDays ?? 0,
    terms: defaults?.defaultWarrantyTerms ?? '',
  };
}

const FORBIDDEN_PUBLIC_JSON_KEY =
  /(cost|identifier|imei|serial|eid|internal|object.?path|bucket|actor|inspector)/i;

function sanitizePublicJson(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return sanitizeRecord(value as Record<string, unknown>);
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_PUBLIC_JSON_KEY.test(key))
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    return sanitizeRecord(value as Record<string, unknown>);
  }
  return ['string', 'number', 'boolean'].includes(typeof value) || value === null ? value : null;
}
