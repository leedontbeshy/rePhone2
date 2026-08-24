import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { requestContext } from '../../common/http/request-context.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { BackofficeRefundListQueryDto } from './refund.dto.js';
import { RefundClock } from './refund-clock.service.js';
import { RefundOperationsRepository } from './refund-operations.repository.js';
import { projectRefundDetail, projectRefundListItem } from './refund.projector.js';
import type {
  RefundDetailDto,
  RefundEvidenceUrlDto,
  RefundListItemDto,
} from './refund-response.dto.js';

@Injectable()
export class RefundQueryService {
  public constructor(
    @Inject(RefundOperationsRepository)
    private readonly refunds: RefundOperationsRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(RefundClock) private readonly clock: RefundClock,
  ) {}

  public async list(
    query: BackofficeRefundListQueryDto,
  ): Promise<PaginatedApiResult<RefundListItemDto>> {
    if (
      query.createdFrom !== undefined &&
      query.createdTo !== undefined &&
      new Date(query.createdFrom) > new Date(query.createdTo)
    ) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        {
          field: 'createdTo',
          code: 'DATE_RANGE_INVALID',
          message: 'createdTo phải cùng hoặc sau createdFrom.',
        },
      ]);
    }
    const page = await this.refunds.list(query);
    return new PaginatedApiResult(page.refunds.map(projectRefundListItem), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: page.totalItems,
      totalPages: page.totalItems === 0 ? 0 : Math.ceil(page.totalItems / query.pageSize),
    });
  }

  public async detail(id: string): Promise<RefundDetailDto> {
    const refund = await this.refunds.findById(id);
    if (refund === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectRefundDetail(refund);
  }

  public async evidenceUrl(
    id: string,
    auth: AuthContext,
    request: Request,
  ): Promise<RefundEvidenceUrlDto> {
    const refund = await this.refunds.findById(id);
    if (refund === null || refund.status !== 'COMPLETED' || refund.method !== 'BANK_TRANSFER') {
      throw new ApiError(refund === null ? 'RESOURCE_NOT_FOUND' : 'EVIDENCE_REQUIRED');
    }
    if (
      refund.evidenceBucket === null ||
      refund.evidenceObjectPath === null ||
      refund.evidenceMimeType === null ||
      refund.evidenceFileSize === null ||
      refund.evidenceSha256 === null
    ) {
      throw new ApiError('EVIDENCE_REQUIRED');
    }

    await this.prisma.$transaction((transaction) =>
      this.audit.write(
        transaction,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'refund.evidence_viewed',
          resourceType: 'Refund',
          resourceId: refund.id,
          metadata: { orderNumber: refund.order.orderNumber },
        },
      ),
    );

    const ttlSeconds = Math.min(this.config.storage.signedUrlTtlSeconds, 300);
    const issuedAt = this.clock.now();
    let url: string;
    try {
      url = await this.storage.createSignedReadUrl(
        refund.evidenceBucket,
        refund.evidenceObjectPath,
        ttlSeconds,
        refund.evidenceMimeType === 'application/pdf'
          ? { download: `refund-${refund.id}.pdf` }
          : undefined,
      );
    } catch {
      throw new ApiError('STORAGE_UNAVAILABLE');
    }
    return {
      url,
      expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1_000).toISOString(),
    };
  }
}
