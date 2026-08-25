import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { requestContext } from '../../common/http/request-context.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuditLogIdParamsDto, BackofficeAuditLogListQueryDto } from './audit-operations.dto.js';
import { AuditLogDetailResponse, AuditLogListResponse } from './audit-operations-response.dto.js';
import { AuditOperationsService } from './audit-operations.service.js';

const AUDIT_QUERY_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-audit')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@UseGuards(SessionGuard, RolesGuard)
@Controller('backoffice/audit-logs')
export class AuditOperationsController {
  public constructor(
    @Inject(AuditOperationsService) private readonly operations: AuditOperationsService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listBackofficeAuditLogs', summary: 'List append-only audit logs' })
  @ApiOkResponse({ type: AuditLogListResponse })
  @ApiErrorResponses(...AUDIT_QUERY_ERRORS)
  public list(
    @Query() query: BackofficeAuditLogListQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.list(query, {
      actorUserId: auth.userId,
      requestId: requestContext(request).requestId,
    });
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBackofficeAuditLog', summary: 'Get audit log detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AuditLogDetailResponse })
  @ApiErrorResponses(...AUDIT_QUERY_ERRORS)
  public detail(
    @Param() params: AuditLogIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.operations.detail(params.id, {
      actorUserId: auth.userId,
      requestId: requestContext(request).requestId,
    });
  }
}
