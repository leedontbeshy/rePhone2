import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { requestContext } from '../../common/http/request-context.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import { PrivateEvidenceValidator } from '../storage/private-evidence.validator.js';
import { isAttachableStatus } from './after-sales-attachment-access.guard.js';
import { AfterSalesClock } from './after-sales-clock.service.js';
import { afterSalesAuditActor, assertAfterSalesOwnership } from './after-sales-ownership.js';
import {
  parseAfterSalesAttachments,
  projectAttachmentCollection,
  type AfterSalesAttachmentRecord,
} from './after-sales.projector.js';
import type { AfterSalesAttachmentCollectionDto } from './after-sales-response.dto.js';
import { AfterSalesRepository } from './after-sales.repository.js';

@Injectable()
export class AfterSalesAttachmentService {
  private readonly logger = new Logger(AfterSalesAttachmentService.name);

  public constructor(
    @Inject(AfterSalesRepository) private readonly repository: AfterSalesRepository,
    @Inject(OrderOwnershipPolicy) private readonly ownership: OrderOwnershipPolicy,
    @Inject(PrivateEvidenceValidator)
    private readonly validator: PrivateEvidenceValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(AfterSalesClock) private readonly clock: AfterSalesClock,
  ) {}

  public async upload(
    request: Request,
    requestNumber: string,
    file: Express.Multer.File | undefined,
  ): Promise<AfterSalesAttachmentCollectionDto> {
    const preflight = await this.repository.findByRequestNumber(requestNumber);
    if (preflight === null) throw new ApiError('RESOURCE_NOT_FOUND');
    assertAfterSalesOwnership(this.ownership, request, preflight.orderItem.order, this.clock.now());
    if (!isAttachableStatus(preflight.status)) throw new ApiError('INVALID_STATE_TRANSITION');
    const evidence = await this.validator.validate(file);
    const attachmentId = randomUUID();
    const objectPath = `after-sales/${preflight.id}/${attachmentId}.${evidence.extension}`;
    let stored: Awaited<ReturnType<StorageProvider['upload']>>;
    try {
      stored = await this.storage.upload({
        bucket: this.config.storage.privateBucket,
        objectPath,
        bytes: evidence.bytes,
        mimeType: evidence.mimeType,
      });
    } catch {
      throw new ApiError('STORAGE_UNAVAILABLE');
    }

    try {
      const updated = await this.transactions.run('after_sales.attachment.upload', async (tx) => {
        const record = await this.repository.lockById(preflight.id, tx);
        if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
        const now = this.clock.now();
        assertAfterSalesOwnership(this.ownership, request, record.orderItem.order, now);
        if (!isAttachableStatus(record.status)) throw new ApiError('INVALID_STATE_TRANSITION');
        const attachments = parseAfterSalesAttachments(record.attachments);
        if (attachments.length >= 5) {
          throw new ApiError('VALIDATION_FAILED', undefined, [
            {
              field: 'file',
              code: 'ATTACHMENT_LIMIT_REACHED',
              message: 'Mỗi yêu cầu hậu mãi chỉ được tối đa 5 tệp.',
            },
          ]);
        }
        const metadata: AfterSalesAttachmentRecord = {
          id: attachmentId,
          bucket: stored.bucket,
          objectPath: stored.objectPath,
          mimeType: evidence.mimeType,
          fileSize: evidence.fileSize,
          uploadedByType: request.auth === undefined ? 'GUEST' : 'USER',
          uploadedById: request.auth?.userId ?? null,
          uploadedAt: now.toISOString(),
        };
        const result = await this.repository.update(
          record.id,
          { attachments: [...attachments, metadata] as unknown as Prisma.InputJsonValue },
          tx,
        );
        await this.audit.write(tx, afterSalesAuditActor(request), {
          action: 'after_sales.attachment_added',
          resourceType: 'AfterSalesRequest',
          resourceId: record.id,
          changes: {
            after: {
              attachmentId,
              mimeType: evidence.mimeType,
              fileSize: evidence.fileSize,
              attachmentCount: attachments.length + 1,
            },
          },
        });
        return result;
      });
      return projectAttachmentCollection(updated);
    } catch (error) {
      await this.deleteBestEffort(preflight.id, stored.bucket, stored.objectPath, request);
      throw error;
    }
  }

  private async deleteBestEffort(
    requestId: string,
    bucket: string,
    objectPath: string,
    request: Request,
  ): Promise<void> {
    try {
      await this.storage.delete(bucket, objectPath);
    } catch {
      this.logger.warn({
        event: 'storage_orphan_candidate',
        afterSalesRequestId: requestId,
        requestId: requestContext(request).requestId,
      });
    }
  }
}
