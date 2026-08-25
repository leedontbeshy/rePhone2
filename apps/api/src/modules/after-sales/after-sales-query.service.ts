import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import type { CustomerAfterSalesListQueryDto } from './after-sales.dto.js';
import { AfterSalesClock } from './after-sales-clock.service.js';
import { afterSalesAuditActor, assertAfterSalesOwnership } from './after-sales-ownership.js';
import {
  parseAfterSalesAttachments,
  projectAfterSalesDetail,
  projectAfterSalesListItem,
} from './after-sales.projector.js';
import type {
  AfterSalesAttachmentUrlDto,
  AfterSalesDetailDto,
  AfterSalesListItemDto,
} from './after-sales-response.dto.js';
import { AfterSalesRepository } from './after-sales.repository.js';

@Injectable()
export class AfterSalesQueryService {
  public constructor(
    @Inject(AfterSalesRepository) private readonly repository: AfterSalesRepository,
    @Inject(OrderOwnershipPolicy) private readonly ownership: OrderOwnershipPolicy,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(AfterSalesClock) private readonly clock: AfterSalesClock,
  ) {}

  public async listCustomer(
    customerId: string,
    query: CustomerAfterSalesListQueryDto,
  ): Promise<PaginatedApiResult<AfterSalesListItemDto>> {
    const page = await this.repository.listCustomer(customerId, query);
    return new PaginatedApiResult(page.items.map(projectAfterSalesListItem), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: page.totalItems,
      totalPages: Math.ceil(page.totalItems / query.pageSize),
    });
  }

  public async detail(request: Request, requestNumber: string): Promise<AfterSalesDetailDto> {
    const record = await this.repository.findByRequestNumber(requestNumber);
    if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const now = this.clock.now();
    assertAfterSalesOwnership(this.ownership, request, record.orderItem.order, now);
    return projectAfterSalesDetail(record, now);
  }

  public async attachmentUrl(
    request: Request,
    requestNumber: string,
    attachmentId: string,
  ): Promise<AfterSalesAttachmentUrlDto> {
    const record = await this.repository.findByRequestNumber(requestNumber);
    if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const now = this.clock.now();
    assertAfterSalesOwnership(this.ownership, request, record.orderItem.order, now);
    const attachment = parseAfterSalesAttachments(record.attachments).find(
      (item) => item.id === attachmentId,
    );
    if (attachment === undefined) throw new ApiError('RESOURCE_NOT_FOUND');

    await this.prisma.$transaction((transaction) =>
      this.audit.write(transaction, afterSalesAuditActor(request), {
        action: 'after_sales.attachment_viewed',
        resourceType: 'AfterSalesRequest',
        resourceId: record.id,
        metadata: { attachmentId },
      }),
    );

    const ttlSeconds = Math.min(this.config.storage.signedUrlTtlSeconds, 300);
    let url: string;
    try {
      url = await this.storage.createSignedReadUrl(
        attachment.bucket,
        attachment.objectPath,
        ttlSeconds,
        attachment.mimeType === 'application/pdf'
          ? { download: `${attachment.id}.pdf` }
          : undefined,
      );
    } catch {
      throw new ApiError('STORAGE_UNAVAILABLE');
    }
    return {
      url,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1_000).toISOString(),
    };
  }
}
