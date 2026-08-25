import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { sanitizeAuditJson } from '../audit/audit-sanitizer.js';
import type { BackofficeAuditLogListQueryDto } from './audit-operations.dto.js';
import {
  AuditOperationsRepository,
  type AuditOperationsRecord,
} from './audit-operations.repository.js';
import type { AuditLogDetailDto, AuditLogListItemDto } from './audit-operations-response.dto.js';

export interface AuditReadContext {
  actorUserId: string;
  requestId: string;
}

@Injectable()
export class AuditOperationsService {
  private readonly logger = new Logger(AuditOperationsService.name);

  public constructor(
    @Inject(AuditOperationsRepository)
    private readonly repository: AuditOperationsRepository,
  ) {}

  public async list(
    query: BackofficeAuditLogListQueryDto,
    context: AuditReadContext,
  ): Promise<PaginatedApiResult<AuditLogListItemDto>> {
    assertDateRange(query.createdFrom, query.createdTo);
    const page = await this.repository.list(query);
    this.logAccess(context, 'LIST', 'FOUND', undefined, page.items.length);
    return new PaginatedApiResult(page.items.map(projectListItem), {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: page.totalItems,
      totalPages: page.totalItems === 0 ? 0 : Math.ceil(page.totalItems / query.pageSize),
    });
  }

  public async detail(id: string, context: AuditReadContext): Promise<AuditLogDetailDto> {
    const record = await this.repository.findById(id);
    this.logAccess(context, 'DETAIL', record === null ? 'NOT_FOUND' : 'FOUND', id);
    if (record === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return projectDetail(record);
  }

  private logAccess(
    context: AuditReadContext,
    operation: 'LIST' | 'DETAIL',
    outcome: 'FOUND' | 'NOT_FOUND',
    auditLogId?: string,
    resultCount?: number,
  ): void {
    this.logger.log({
      event: 'security.audit_log.accessed',
      operation,
      outcome,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      ...(auditLogId === undefined ? {} : { auditLogId }),
      ...(resultCount === undefined ? {} : { resultCount }),
    });
  }
}

function assertDateRange(createdFrom?: string, createdTo?: string): void {
  if (
    createdFrom !== undefined &&
    createdTo !== undefined &&
    new Date(createdFrom) > new Date(createdTo)
  ) {
    throw new ApiError('VALIDATION_FAILED', undefined, [
      {
        field: 'createdTo',
        code: 'DATE_RANGE_INVALID',
        message: 'createdTo phải cùng hoặc sau createdFrom.',
      },
    ]);
  }
}

function projectListItem(record: AuditOperationsRecord): AuditLogListItemDto {
  return {
    id: record.id,
    actorType: record.actorType,
    actor:
      record.actorUser === null
        ? null
        : {
            id: record.actorUser.id,
            fullName: record.actorUser.fullName,
            role: record.actorUser.role,
            employeeCode: record.actorUser.employeeCode,
          },
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    requestId: record.requestId,
    changes: sanitizeAuditJson(record.changes) ?? null,
    metadata: sanitizeAuditJson(record.metadata) ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

function projectDetail(record: AuditOperationsRecord): AuditLogDetailDto {
  const item = projectListItem(record);
  return {
    id: item.id,
    actorType: item.actorType,
    actor: item.actor,
    action: item.action,
    resourceType: item.resourceType,
    resourceId: item.resourceId,
    requestId: item.requestId,
    changes: item.changes,
    metadata: item.metadata,
    createdAt: item.createdAt,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent?.slice(0, 1_000) ?? null,
  };
}
