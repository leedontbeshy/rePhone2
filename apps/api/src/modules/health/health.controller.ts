import { Controller, Get } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthErrorResponse, HealthOkResponse } from './health-response.dto.js';
import { HealthService } from './health.service.js';

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
