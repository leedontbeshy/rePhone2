import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { AfterSalesClock } from './after-sales-clock.service.js';
import type { BackofficeAfterSalesListQueryDto } from './after-sales.dto.js';
import { backofficeAfterSalesActions } from './after-sales-policy.js';
import {
  parseAfterSalesAttachments,
  projectAfterSalesDetail,
  projectAfterSalesListItem,
  projectAttachments,
} from './after-sales.projector.js';
import type {
  AfterSalesAttachmentUrlDto,
  AfterSalesDetailDto,
} from './after-sales-response.dto.js';
import type {
  BackofficeAfterSalesDetailDto,
  BackofficeAfterSalesListItemDto,
} from './after-sales-backoffice-response.dto.js';
import {
  AfterSalesBackofficeRepository,
  type AfterSalesBackofficeRecord,
} from './after-sales-backoffice.repository.js';

type StaffRole = 'EMPLOYEE' | 'ADMIN';

@Injectable()
export class AfterSalesBackofficeQueryService {
  public constructor(
    @Inject(AfterSalesBackofficeRepository)
    private readonly repository: AfterSalesBackofficeRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(AfterSalesClock) private readonly clock: AfterSalesClock,
  ) {}

  public async list(
    query: BackofficeAfterSalesListQueryDto,
  ): Promise<PaginatedApiResult<BackofficeAfterSalesListItemDto>> {
    assertDateRange(query.createdFrom, query.createdTo);
    const page = await this.repository.list(query);
    return new PaginatedApiResult(page.items.map(projectListItem), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: page.totalItems,
      totalPages: Math.ceil(page.totalItems / query.pageSize),
    });
  }

  public async detail(id: string, role: StaffRole): Promise<BackofficeAfterSalesDetailDto> {
    const record = await this.repository.findById(id);
    if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectDetail(record, role, this.clock.now());
  }

  public async attachmentUrl(
    id: string,
    attachmentId: string,
    actor: AuditActorContext,
  ): Promise<AfterSalesAttachmentUrlDto> {
    const record = await this.repository.findById(id);
    if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const attachment = parseAfterSalesAttachments(record.attachments).find(
      (candidate) => candidate.id === attachmentId,
    );
    if (attachment === undefined) throw new ApiError('RESOURCE_NOT_FOUND');

    await this.prisma.$transaction((transaction) =>
      this.audit.write(transaction, actor, {
        action: 'after_sales.attachment_viewed',
        resourceType: 'AfterSalesRequest',
        resourceId: record.id,
        metadata: { attachmentId },
      }),
    );

    const now = this.clock.now();
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
    return { url, expiresAt: new Date(now.getTime() + ttlSeconds * 1_000).toISOString() };
  }
}

function projectListItem(record: AfterSalesBackofficeRecord): BackofficeAfterSalesListItemDto {
  return {
    id: record.id,
    ...projectAfterSalesListItem(record),
    customer: customer(record),
    assignedTo: actor(record.assignedTo),
    attachmentCount: projectAttachments(record.attachments).length,
  };
}

function projectDetail(
  record: AfterSalesBackofficeRecord,
  role: StaffRole,
  now: Date,
): BackofficeAfterSalesDetailDto {
  const publicDetail: AfterSalesDetailDto = projectAfterSalesDetail(record, now);
  const { availableActions: _customerActions, ...safePublicDetail } = publicDetail;
  const actions = backofficeAfterSalesActions(
    record.status,
    record.orderItem.productTypeSnapshot === 'IPHONE',
    role,
  );
  const decisionReady =
    record.orderItem.productTypeSnapshot === 'IPHONE'
      ? record.inventoryInspection?.status === 'COMPLETED'
      : record.inspectionSummary !== null;
  return {
    id: record.id,
    ...safePublicDetail,
    customer: customer(record),
    assignedTo: actor(record.assignedTo),
    attachmentCount: projectAttachments(record.attachments).length,
    receivedLocation: record.receivedLocation,
    receivedBy: actor(record.receivedBy),
    receiveNote: record.receiveNote,
    inspectionSummary: record.inspectionSummary,
    inspection:
      record.inventoryInspection === null
        ? null
        : {
            id: record.inventoryInspection.id,
            type: record.inventoryInspection.inspectionType,
            status: record.inventoryInspection.status,
            overallResult: record.inventoryInspection.overallResult,
            inspector: actor(record.inventoryInspection.inspector),
            inspectedAt: record.inventoryInspection.inspectedAt?.toISOString() ?? null,
          },
    decidedBy: actor(record.decidedBy),
    resolvedBy: actor(record.resolvedBy),
    returnNote: record.returnNote,
    refund:
      record.refund === null
        ? null
        : {
            id: record.refund.id,
            amount: record.refund.amount.toString(),
            method: record.refund.method,
            status: record.refund.status,
            completedAt: record.refund.completedAt?.toISOString() ?? null,
          },
    replacementUnit: record.replacementInventoryUnit,
    availableActions:
      record.status === 'INSPECTING' && !decisionReady
        ? actions.filter((action) => action !== 'APPROVE' && action !== 'REJECT')
        : actions,
  };
}

function customer(record: AfterSalesBackofficeRecord) {
  return {
    id: record.orderItem.order.customerId,
    name: record.orderItem.order.customerName,
    email: record.orderItem.order.customerEmail,
    phone: record.orderItem.order.customerPhone,
  };
}

function actor(value: { id: string; fullName: string } | null) {
  return value === null ? null : { id: value.id, fullName: value.fullName };
}

function assertDateRange(from?: string, to?: string): void {
  if (from !== undefined && to !== undefined && new Date(from) > new Date(to)) {
    throw new ApiError('VALIDATION_FAILED', undefined, [
      {
        field: 'createdTo',
        code: 'DATE_RANGE_INVALID',
        message: 'createdTo phải cùng hoặc sau createdFrom.',
      },
    ]);
  }
}
