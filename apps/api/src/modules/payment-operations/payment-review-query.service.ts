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
import type { BackofficePaymentListQueryDto } from './payment-operation.dto.js';
import {
  projectBackofficePaymentDetail,
  projectBackofficePaymentListItem,
} from './payment-operation.projector.js';
import type {
  BackofficePaymentDetailDto,
  BackofficePaymentListItemDto,
  PaymentEvidenceUrlDto,
} from './payment-operation-response.dto.js';
import { PaymentClock } from './payment-clock.service.js';
import { PaymentOperationsRepository } from './payment-operations.repository.js';

@Injectable()
export class PaymentReviewQueryService {
  public constructor(
    @Inject(PaymentOperationsRepository)
    private readonly payments: PaymentOperationsRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(PaymentClock) private readonly clock: PaymentClock,
  ) {}

  public async list(
    query: BackofficePaymentListQueryDto,
  ): Promise<PaginatedApiResult<BackofficePaymentListItemDto>> {
    if (
      query.submittedFrom !== undefined &&
      query.submittedTo !== undefined &&
      new Date(query.submittedFrom) > new Date(query.submittedTo)
    ) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        {
          field: 'submittedTo',
          code: 'DATE_RANGE_INVALID',
          message: 'submittedTo phải cùng hoặc sau submittedFrom.',
        },
      ]);
    }
    const now = this.clock.now();
    const page = await this.payments.list(query, now);
    return new PaginatedApiResult(
      page.payments.map((payment) => projectBackofficePaymentListItem(payment, this.config, now)),
      {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: page.totalItems,
        totalPages: page.totalItems === 0 ? 0 : Math.ceil(page.totalItems / query.pageSize),
      },
    );
  }

  public async detail(id: string): Promise<BackofficePaymentDetailDto> {
    const payment = await this.payments.findById(id);
    if (payment === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectBackofficePaymentDetail(payment, this.config, this.clock.now());
  }

  public async evidenceUrl(
    id: string,
    auth: AuthContext,
    request: Request,
  ): Promise<PaymentEvidenceUrlDto> {
    const payment = await this.payments.findById(id);
    if (payment === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (payment.evidenceBucket === null || payment.evidenceObjectPath === null) {
      throw new ApiError('EVIDENCE_REQUIRED');
    }
    const ttlSeconds = Math.min(this.config.storage.signedUrlTtlSeconds, 300);
    let url: string;
    try {
      url = await this.storage.createSignedReadUrl(
        payment.evidenceBucket,
        payment.evidenceObjectPath,
        ttlSeconds,
        payment.evidenceObjectPath.toLowerCase().endsWith('.pdf')
          ? { download: `payment-${payment.id}.pdf` }
          : undefined,
      );
    } catch {
      throw new ApiError('STORAGE_UNAVAILABLE');
    }
    await this.prisma.$transaction(async (transaction) => {
      await this.audit.write(
        transaction,
        { actorUserId: auth.userId, ...requestContext(request) },
        {
          action: 'payment.evidence_viewed',
          resourceType: 'Payment',
          resourceId: payment.id,
          metadata: { orderNumber: payment.order.orderNumber },
        },
      );
    });
    const now = this.clock.now();
    return { url, expiresAt: new Date(now.getTime() + ttlSeconds * 1_000).toISOString() };
  }
}
