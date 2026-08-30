import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { OperationsOverviewResponse } from './operations-overview-response.dto.js';
import { OperationsOverviewService } from './operations-overview.service.js';

@ApiTags('backoffice-overview')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/overview')
export class OperationsOverviewController {
  public constructor(private readonly overview: OperationsOverviewService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
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
