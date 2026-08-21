import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, ProductMedia } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { StorageProviderError } from '../../common/providers/supabase-storage.provider.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { BackofficeCatalogService } from '../backoffice-catalog/backoffice-catalog.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ImageUploadValidator } from './image-upload.validator.js';
import type { UpdateProductMediaDto, UploadProductMediaDto } from './media.dto.js';
import type { ProductMediaDto } from './media-response.dto.js';
import { MediaRepository } from './media.repository.js';

export type MediaOwnerType = 'PRODUCT' | 'VARIANT' | 'INVENTORY_UNIT';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  public constructor(
    @Inject(MediaRepository) private readonly repository: MediaRepository,
    @Inject(ImageUploadValidator) private readonly imageValidator: ImageUploadValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(BackofficeCatalogService) private readonly catalog: BackofficeCatalogService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async upload(
    ownerType: MediaOwnerType,
    ownerId: string,
    file: Express.Multer.File | undefined,
    input: UploadProductMediaDto,
    actor: AuditActorContext,
  ): Promise<ProductMediaDto> {
    await this.assertOwner(ownerType, ownerId);
    const image = await this.imageValidator.validate(file);
    const objectPath = `${ownerPrefix(ownerType)}/${ownerId}/${randomUUID()}.${image.extension}`;
    let stored;
    try {
      stored = await this.storage.upload({
        bucket: this.config.storage.publicBucket,
        objectPath,
        bytes: image.bytes,
        mimeType: image.mimeType,
      });
    } catch (error) {
      if (error instanceof StorageProviderError || error instanceof Error) {
        throw new ApiError('STORAGE_UNAVAILABLE');
      }
      throw error;
    }

    try {
      const media = await this.transactions.run('media.product.attach', async (transaction) => {
        await this.assertOwner(ownerType, ownerId, transaction);
        const created = await this.repository.create(
          {
            ...ownerData(ownerType, ownerId),
            bucket: stored.bucket,
            objectPath: stored.objectPath,
            visibility: 'PUBLIC',
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            fileSize: image.fileSize,
            sortOrder: input.sortOrder ?? 0,
            ...(input.altText === undefined ? {} : { altText: input.altText }),
          },
          transaction,
        );
        await this.audit.write(transaction, actor, {
          action: 'media.product.attached',
          resourceType: 'ProductMedia',
          resourceId: created.id,
          changes: {
            after: {
              ownerType,
              ownerId,
              mimeType: image.mimeType,
              fileSize: image.fileSize,
              sortOrder: created.sortOrder,
            },
          },
        });
        return created;
      });
      return toMediaDto(media, this.config);
    } catch (error) {
      await this.deleteBestEffort(stored.bucket, stored.objectPath, actor.requestId);
      throw error;
    }
  }

  public async update(
    id: string,
    input: UpdateProductMediaDto,
    actor: AuditActorContext,
  ): Promise<ProductMediaDto> {
    const media = await this.transactions.run('media.product.update', async (transaction) => {
      const existing = await this.repository.find(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const owner = mediaOwner(existing);
      await this.assertOwner(owner.type, owner.id, transaction);
      const updated = await this.repository.update(
        id,
        {
          ...(input.altText === undefined ? {} : { altText: input.altText }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        },
        transaction,
      );
      await this.audit.write(transaction, actor, {
        action: 'media.product.updated',
        resourceType: 'ProductMedia',
        resourceId: id,
        changes: {
          before: { altText: existing.altText, sortOrder: existing.sortOrder },
          after: { altText: updated.altText, sortOrder: updated.sortOrder },
        },
      });
      return updated;
    });
    return toMediaDto(media, this.config);
  }

  public async delete(id: string, actor: AuditActorContext): Promise<void> {
    const deleted = await this.transactions.run('media.product.delete', async (transaction) => {
      const existing = await this.repository.find(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const owner = mediaOwner(existing);
      await this.assertOwner(owner.type, owner.id, transaction);
      if (owner.type === 'INVENTORY_UNIT') {
        await this.inventory.assertCanDeleteUnitMedia(owner.id, transaction);
      }
      const record = await this.repository.delete(id, transaction);
      await this.audit.write(transaction, actor, {
        action: 'media.product.deleted',
        resourceType: 'ProductMedia',
        resourceId: id,
        changes: { before: { ownerType: owner.type, ownerId: owner.id } },
      });
      return record;
    });
    await this.deleteBestEffort(deleted.bucket, deleted.objectPath, actor.requestId);
  }

  private assertOwner(type: MediaOwnerType, id: string, transaction?: Prisma.TransactionClient) {
    switch (type) {
      case 'PRODUCT':
        return this.catalog.assertProductMediaOwner(id, transaction);
      case 'VARIANT':
        return this.catalog.assertVariantMediaOwner(id, transaction);
      case 'INVENTORY_UNIT':
        return this.inventory.assertUnitMediaOwner(id, transaction);
    }
  }

  private async deleteBestEffort(
    bucket: string,
    objectPath: string,
    requestId: string,
  ): Promise<void> {
    try {
      await this.storage.delete(bucket, objectPath);
    } catch {
      this.logger.warn({
        event: 'storage_orphan_candidate',
        requestId,
        bucket,
        objectPath,
      });
    }
  }
}

function ownerData(
  type: MediaOwnerType,
  id: string,
): Pick<Prisma.ProductMediaUncheckedCreateInput, 'productId' | 'variantId' | 'inventoryUnitId'> {
  return {
    productId: type === 'PRODUCT' ? id : null,
    variantId: type === 'VARIANT' ? id : null,
    inventoryUnitId: type === 'INVENTORY_UNIT' ? id : null,
  };
}

function mediaOwner(media: ProductMedia): { type: MediaOwnerType; id: string } {
  if (media.productId !== null) return { type: 'PRODUCT', id: media.productId };
  if (media.variantId !== null) return { type: 'VARIANT', id: media.variantId };
  if (media.inventoryUnitId !== null) {
    return { type: 'INVENTORY_UNIT', id: media.inventoryUnitId };
  }
  throw new ApiError('INTERNAL_ERROR');
}

function ownerPrefix(type: MediaOwnerType): string {
  return type === 'PRODUCT' ? 'products' : type === 'VARIANT' ? 'variants' : 'units';
}

function toMediaDto(media: ProductMedia, config: AppConfig): ProductMediaDto {
  const owner = mediaOwner(media);
  const encodedPath = media.objectPath.split('/').map(encodeURIComponent).join('/');
  return {
    id: media.id,
    ownerType: owner.type,
    ownerId: owner.id,
    url: `${config.storage.url.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(media.bucket)}/${encodedPath}`,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    width: media.width ?? 0,
    height: media.height ?? 0,
    sortOrder: media.sortOrder,
    altText: media.altText,
    createdAt: media.createdAt,
  };
}
