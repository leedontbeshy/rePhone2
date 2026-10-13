import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { OperationsOverviewResponse } from './operations-overview-response.dto.js';
import { OperationsOverviewService } from './operations-overview.service.js';
import { FinancialReportService } from './financial-report.service.js';
import { FinancialReportQueryDto, FinancialReportResponse } from './financial-report.dto.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import type { AuthContext } from '../auth/auth-context.js';
import { PendingTasksService } from './pending-tasks.service.js';
import { PendingTasksResponse } from './pending-tasks.dto.js';

@ApiTags('backoffice-overview')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/overview')
export class OperationsOverviewController {
  public constructor(
    @Inject(OperationsOverviewService) private readonly overview: OperationsOverviewService,
    @Inject(FinancialReportService) private readonly finance: FinancialReportService,
    @Inject(PendingTasksService) private readonly pendingTasks: PendingTasksService,
  ) {}

  @Get('pending-tasks')
  @ApiOperation({
    operationId: 'getBackofficePendingTasks',
    summary: 'Get role-aware pending task counts for the backoffice sidebar',
  })
  @ApiOkResponse({ type: PendingTasksResponse })
  @ApiErrorResponses(
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public tasks(@CurrentAuth() auth: AuthContext) {
    return this.pendingTasks.get(auth.role === 'ADMIN');
  }

  @Get('financial')
  @ApiQuery({
    name: 'month',
    required: false,
    type: String,
    pattern: '^(20[0-9]{2})-(0[1-9]|1[0-2])$',
  })
  @ApiOperation({
    operationId: 'getBackofficeFinancialReport',
    summary: 'Monthly completed sales and current financial position; costs are admin-only',
  })
  @ApiOkResponse({ type: FinancialReportResponse })
  @ApiErrorResponses(
    { status: 400, description: 'VALIDATION_FAILED' },
    { status: 401, description: 'AUTH_REQUIRED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public financial(@Query() query: FinancialReportQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.finance.get(query.month, auth.role === 'ADMIN');
  }

  @Get()
  @ApiOperation({
    operationId: 'getBackofficeOperationsOverview',
    summary: 'Get the current operations overview snapshot',
  })
  @ApiOkResponse({ type: OperationsOverviewResponse })
  @ApiErrorResponses(
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 500, description: 'INTERNAL_ERROR' },
  )
  public get() {
    return this.overview.get();
  }
}
