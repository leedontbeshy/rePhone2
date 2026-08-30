import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { HealthErrorResponse, HealthOkResponse } from './health-response.dto.js';
import { HealthService } from './health.service.js';
import { SystemHealthDetailResponse } from './system-health-response.dto.js';
import { SystemHealthService } from './system-health.service.js';

const requestIdResponseHeader = {
  'X-Request-Id': {
    description: 'Correlation ID used by response logs and diagnostics.',
    schema: { type: 'string' },
  },
};

@ApiTags('health')
@ApiHeader({
  name: 'X-Request-Id',
  required: false,
  description: 'UUID/ULID correlation ID; invalid values are replaced by the server.',
  schema: { type: 'string', maxLength: 64 },
})
@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ operationId: 'getLiveness', summary: 'Check whether the API process is live' })
  @ApiOkResponse({ type: HealthOkResponse, headers: requestIdResponseHeader })
  public liveness(): HealthOkResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'getReadiness', summary: 'Check database readiness and migrations' })
  @ApiOkResponse({ type: HealthOkResponse, headers: requestIdResponseHeader })
  @ApiServiceUnavailableResponse({ type: HealthErrorResponse, headers: requestIdResponseHeader })
  public readiness(): Promise<HealthOkResponse> {
    return this.healthService.readiness();
  }
}

@ApiTags('system-health')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/system/health')
export class SystemHealthController {
  public constructor(
    @Inject(SystemHealthService) private readonly systemHealth: SystemHealthService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getBackofficeSystemHealth',
    summary: 'Get safe detailed backend health information',
  })
  @ApiOkResponse({ type: SystemHealthDetailResponse })
  @ApiErrorResponses(
    { status: 401, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
    { status: 403, description: 'FORBIDDEN' },
    { status: 429, description: 'RATE_LIMITED' },
  )
  public inspect() {
    return this.systemHealth.inspect();
  }
}
