import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { WarrantyPolicyReader } from '../warranty/warranty-policy.reader.js';
import type {
  ArchiveReasonDto,
  BackofficeProductListQueryDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './backoffice-catalog.dto.js';
import type {
  BackofficeProductDetailDto,
  BackofficeProductListItemDto,
  BackofficeVariantDto,
} from './backoffice-catalog-response.dto.js';
import {
  BackofficeCatalogRepository,
  type BackofficeProductRecord,
} from './backoffice-catalog.repository.js';

@Injectable()
export class BackofficeCatalogService {
  public constructor(
    @Inject(BackofficeCatalogRepository)
    private readonly repository: BackofficeCatalogRepository,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(WarrantyPolicyReader)
    private readonly warrantyPolicies: WarrantyPolicyReader,
  ) {}

  public async listProducts(query: BackofficeProductListQueryDto) {
    const result = await this.repository.listProducts(query);
    return new PaginatedApiResult(
      result.items.map((product) => toProductListItem(product, this.config)),
      {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    );
  }

  public async getProduct(id: string): Promise<BackofficeProductDetailDto> {
    const product = await this.repository.findProduct(id);
    if (product === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return this.toProductDetail(product);
  }

  public async createProduct(
    input: CreateProductDto,
    actor: AuditActorContext,
  ): Promise<BackofficeProductDetailDto> {
    assertProductShape(input.type, input);
    try {
      const product = await this.transactions.run('catalog.product.create', async (transaction) => {
        const created = await this.repository.createProduct(input, transaction);
        await this.audit.write(transaction, actor, {
          action: 'catalog.product.created',
          resourceType: 'Product',
          resourceId: created.id,
          changes: { after: { type: created.type, slug: created.slug, status: created.status } },
        });
        return created;
      });
      return this.toProductDetail(product);
    } catch (error) {
      mapUniqueError(error);
    }
  }

  public async updateProduct(
    id: string,
    input: UpdateProductDto,
    actor: AuditActorContext,
  ): Promise<BackofficeProductDetailDto> {
    try {
      const product = await this.transactions.run('catalog.product.update', async (transaction) => {
        const existing = await this.repository.findProduct(id, transaction);
        if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (existing.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
        const nextType = input.type ?? existing.type;
        if (
          input.type !== undefined &&
          input.type !== existing.type &&
          existing.variants.length > 0
        ) {
          throw validation('type', 'PRODUCT_TYPE_IMMUTABLE');
        }
        assertProductShape(nextType, input);
        const updated = await this.repository.updateProduct(
          id,
          {
            ...(input.type === undefined ? {} : { type: input.type }),
            ...(input.brand === undefined ? {} : { brand: input.brand }),
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.slug === undefined ? {} : { slug: input.slug }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.releaseYear === undefined ? {} : { releaseYear: input.releaseYear }),
            ...(input.chipset === undefined ? {} : { chipset: input.chipset }),
            ...(input.ramGb === undefined ? {} : { ramGb: input.ramGb }),
            ...(input.screenSizeInches === undefined
              ? {}
              : { screenSizeInches: input.screenSizeInches }),
            ...(input.warrantyPolicyId === undefined
              ? {}
              : { warrantyPolicy: { connect: { id: input.warrantyPolicyId } } }),
            ...(input.seoTitle === undefined ? {} : { seoTitle: input.seoTitle }),
            ...(input.seoDescription === undefined ? {} : { seoDescription: input.seoDescription }),
            ...(nextType === 'ACCESSORY'
              ? { releaseYear: null, chipset: null, ramGb: null, screenSizeInches: null }
              : {}),
          },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'catalog.product.updated',
          resourceType: 'Product',
          resourceId: id,
          changes: {
            before: { type: existing.type, slug: existing.slug, status: existing.status },
            after: { type: updated.type, slug: updated.slug, status: updated.status },
          },
        });
        return updated;
      });
      return this.toProductDetail(product);
    } catch (error) {
      mapUniqueError(error);
    }
  }

  public async publishProduct(id: string, actor: AuditActorContext) {
    const product = await this.transactions.run('catalog.product.publish', async (transaction) => {
      const existing = await this.repository.findProduct(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
      if (!existing.variants.some((variant) => variant.status === 'ACTIVE')) {
        throw validation('variants', 'ACTIVE_VARIANT_REQUIRED');
      }
      await this.assertUsableWarrantyPolicy(existing.warrantyPolicyId, transaction);
      for (const variant of existing.variants) {
        if (variant.status === 'ACTIVE') {
          await this.assertUsableWarrantyPolicy(variant.warrantyPolicyId, transaction);
        }
      }
      const updated = await this.repository.updateProduct(id, { status: 'ACTIVE' }, transaction);
      await this.audit.write(transaction, actor, {
        action: 'catalog.product.published',
        resourceType: 'Product',
        resourceId: id,
        changes: { before: { status: existing.status }, after: { status: 'ACTIVE' } },
      });
      return updated;
    });
    return this.toProductDetail(product);
  }

  public async archiveProduct(id: string, input: ArchiveReasonDto, actor: AuditActorContext) {
    const product = await this.transactions.run('catalog.product.archive', async (transaction) => {
      const existing = await this.repository.findProduct(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
      const updated = await this.repository.updateProduct(
        id,
        { status: 'ARCHIVED', archivedAt: new Date() },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'catalog.product.archived',
        resourceType: 'Product',
        resourceId: id,
        changes: { before: { status: existing.status }, after: { status: 'ARCHIVED' } },
        metadata: { reason: input.reason },
      });
      return updated;
    });
    return this.toProductDetail(product);
  }

  public async createVariant(
    productId: string,
    input: CreateVariantDto,
    actor: AuditActorContext,
  ): Promise<BackofficeVariantDto> {
    try {
      const variant = await this.transactions.run('catalog.variant.create', async (transaction) => {
        const product = await this.repository.findProduct(productId, transaction);
        if (product === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (product.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
        assertVariantShape(product.type, input);
        const created = await this.repository.createVariant(
          productId,
          product.type === 'IPHONE' ? 'SERIALIZED' : 'QUANTITY',
          input,
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'catalog.variant.created',
          resourceType: 'ProductVariant',
          resourceId: created.id,
          changes: { after: { sku: created.sku, status: created.status } },
        });
        return created;
      });
      return toVariantDto(variant, this.config);
    } catch (error) {
      mapUniqueError(error);
    }
  }

  public async updateVariant(id: string, input: UpdateVariantDto, actor: AuditActorContext) {
    try {
      const variant = await this.transactions.run('catalog.variant.update', async (transaction) => {
        const existing = await this.repository.findVariant(id, transaction);
        if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
        if (existing.status === 'ARCHIVED' || existing.product.status === 'ARCHIVED') {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        const hasActivity =
          existing._count.stockLevels > 0 ||
          existing._count.stockMovements > 0 ||
          existing._count.orderItems > 0;
        if (hasActivity && input.sku !== undefined && input.sku !== existing.sku) {
          throw validation('sku', 'SKU_IMMUTABLE');
        }
        assertVariantShape(existing.product.type, input);
        assertPricePair(
          input.salePrice === undefined ? existing.salePrice?.toString() : input.salePrice,
          input.compareAtPrice === undefined
            ? existing.compareAtPrice?.toString()
            : (input.compareAtPrice ?? undefined),
        );
        const updated = await this.repository.updateVariant(id, input, transaction);
        await this.audit.write(transaction, actor, {
          action: 'catalog.variant.updated',
          resourceType: 'ProductVariant',
          resourceId: id,
          changes: {
            before: { sku: existing.sku, status: existing.status },
            after: { sku: updated.sku, status: updated.status },
          },
        });
        return updated;
      });
      return toVariantDto(variant, this.config);
    } catch (error) {
      mapUniqueError(error);
    }
  }

  public async activateVariant(id: string, actor: AuditActorContext) {
    const variant = await this.transactions.run('catalog.variant.activate', async (transaction) => {
      const existing = await this.repository.findVariant(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.status === 'ARCHIVED' || existing.product.status === 'ARCHIVED') {
        throw new ApiError('INVALID_STATE_TRANSITION');
      }
      if (existing.product.type === 'ACCESSORY' && existing.salePrice === null) {
        throw validation('salePrice', 'SALE_PRICE_REQUIRED');
      }
      if (
        existing.product.type === 'IPHONE' &&
        (existing.storageCapacityGb === null || existing.colorName === null)
      ) {
        throw validation('variant', 'IPHONE_CONFIGURATION_REQUIRED');
      }
      await this.assertUsableWarrantyPolicy(
        existing.warrantyPolicyId ?? existing.product.warrantyPolicyId,
        transaction,
      );
      const updated = await this.repository.updateVariantStatus(
        id,
        { status: 'ACTIVE' },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'catalog.variant.activated',
        resourceType: 'ProductVariant',
        resourceId: id,
        changes: { before: { status: existing.status }, after: { status: 'ACTIVE' } },
      });
      return updated;
    });
    return toVariantDto(variant, this.config);
  }

  public async archiveVariant(id: string, input: ArchiveReasonDto, actor: AuditActorContext) {
    const variant = await this.transactions.run('catalog.variant.archive', async (transaction) => {
      const existing = await this.repository.findVariant(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (existing.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
      if (
        existing.status === 'ACTIVE' &&
        existing.product.status === 'ACTIVE' &&
        (await this.repository.countActiveVariants(existing.productId, transaction)) <= 1
      ) {
        throw validation('variant', 'LAST_ACTIVE_VARIANT_REQUIRED');
      }
      const updated = await this.repository.updateVariantStatus(
        id,
        { status: 'ARCHIVED', archivedAt: new Date() },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'catalog.variant.archived',
        resourceType: 'ProductVariant',
        resourceId: id,
        changes: { before: { status: existing.status }, after: { status: 'ARCHIVED' } },
        metadata: { reason: input.reason },
      });
      return updated;
    });
    return toVariantDto(variant, this.config);
  }

  public async assertProductMediaOwner(id: string, transaction?: Prisma.TransactionClient) {
    const product = await this.repository.findProduct(id, transaction);
    if (product === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (product.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
    return product;
  }

  public async assertVariantMediaOwner(id: string, transaction?: Prisma.TransactionClient) {
    const variant = await this.repository.findVariant(id, transaction);
    if (variant === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (variant.status === 'ARCHIVED' || variant.product.status === 'ARCHIVED') {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
    return variant;
  }

  private async assertUsableWarrantyPolicy(
    policyId: string | null,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (policyId === null) return;
    if ((await this.warrantyPolicies.findUsableById(policyId, transaction)) === null) {
      throw validation('warrantyPolicyId', 'WARRANTY_POLICY_NOT_ACTIVE');
    }
  }

  private toProductDetail(product: BackofficeProductRecord): BackofficeProductDetailDto {
    const summary = toProductListItem(product, this.config);
    return {
      id: summary.id,
      type: summary.type,
      brand: summary.brand,
      name: summary.name,
      slug: summary.slug,
      status: summary.status,
      releaseYear: summary.releaseYear,
      variantCount: summary.variantCount,
      primaryMedia: summary.primaryMedia,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      description: product.description,
      chipset: product.chipset,
      ramGb: product.ramGb,
      screenSizeInches: product.screenSizeInches?.toString() ?? null,
      warrantyPolicyId: product.warrantyPolicyId,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      archivedAt: product.archivedAt,
      variants: product.variants.map((variant) => toVariantDto(variant, this.config)),
      media: product.media.map((media) => toMediaSummary(media, this.config)),
    };
  }
}

function toProductListItem(
  product: {
    id: string;
    type: 'IPHONE' | 'ACCESSORY';
    brand: string;
    name: string;
    slug: string;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    releaseYear: number | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { variants: number };
    media: Array<{
      id: string;
      bucket: string;
      objectPath: string;
      altText: string | null;
      sortOrder: number;
    }>;
  },
  config: AppConfig,
): BackofficeProductListItemDto {
  return {
    id: product.id,
    type: product.type,
    brand: product.brand,
    name: product.name,
    slug: product.slug,
    status: product.status,
    releaseYear: product.releaseYear,
    variantCount: product._count.variants,
    primaryMedia: product.media[0] === undefined ? null : toMediaSummary(product.media[0], config),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toVariantDto(
  variant: {
    id: string;
    productId: string;
    sku: string;
    displayName: string;
    storageCapacityGb: number | null;
    colorName: string | null;
    colorHex: string | null;
    inventoryMode: 'SERIALIZED' | 'QUANTITY';
    salePrice: { toString(): string } | null;
    compareAtPrice: { toString(): string } | null;
    accessoryAttributes: unknown;
    warrantyPolicyId: string | null;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    media: Array<{
      id: string;
      bucket: string;
      objectPath: string;
      altText: string | null;
      sortOrder: number;
    }>;
    createdAt: Date;
    updatedAt: Date;
  },
  config: AppConfig,
): BackofficeVariantDto {
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    displayName: variant.displayName,
    storageCapacityGb: variant.storageCapacityGb,
    colorName: variant.colorName,
    colorHex: variant.colorHex,
    inventoryMode: variant.inventoryMode,
    salePrice: variant.salePrice?.toString() ?? null,
    compareAtPrice: variant.compareAtPrice?.toString() ?? null,
    accessoryAttributes: variant.accessoryAttributes,
    warrantyPolicyId: variant.warrantyPolicyId,
    status: variant.status,
    media: variant.media.map((media) => toMediaSummary(media, config)),
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}

function toMediaSummary(
  media: {
    id: string;
    bucket: string;
    objectPath: string;
    altText: string | null;
    sortOrder: number;
  },
  config: AppConfig,
) {
  return {
    id: media.id,
    url: publicMediaUrl(config, media.bucket, media.objectPath),
    altText: media.altText,
    sortOrder: media.sortOrder,
  };
}

function assertProductShape(type: 'IPHONE' | 'ACCESSORY', input: Partial<CreateProductDto>): void {
  if (
    type === 'ACCESSORY' &&
    [input.releaseYear, input.chipset, input.ramGb, input.screenSizeInches].some(
      (value) => value !== undefined,
    )
  ) {
    throw validation('type', 'ACCESSORY_PHONE_SPECS_FORBIDDEN');
  }
}

function assertVariantShape(type: 'IPHONE' | 'ACCESSORY', input: Partial<CreateVariantDto>): void {
  if (
    type === 'IPHONE' &&
    (input.salePrice !== undefined || input.accessoryAttributes !== undefined)
  ) {
    throw validation('salePrice', 'IPHONE_VARIANT_PRICE_FORBIDDEN');
  }
  if (type === 'ACCESSORY' && input.storageCapacityGb !== undefined) {
    throw validation('storageCapacityGb', 'ACCESSORY_STORAGE_FORBIDDEN');
  }
  assertPricePair(input.salePrice, input.compareAtPrice);
}

function assertPricePair(salePrice?: string | null, compareAtPrice?: string | null): void {
  if (
    salePrice !== undefined &&
    salePrice !== null &&
    compareAtPrice !== undefined &&
    compareAtPrice !== null &&
    BigInt(compareAtPrice) < BigInt(salePrice)
  ) {
    throw validation('compareAtPrice', 'COMPARE_AT_PRICE_TOO_LOW');
  }
}

function validation(field: string, code: string): ApiError {
  return new ApiError('VALIDATION_FAILED', undefined, [{ field, code, message: code }]);
}

function mapUniqueError(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    throw new ApiError('DUPLICATE_RESOURCE');
  }
  throw error;
}

function publicMediaUrl(config: AppConfig, bucket: string, objectPath: string): string {
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${config.storage.url.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}
