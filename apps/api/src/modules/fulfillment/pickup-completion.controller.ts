import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../../common/http/api-error-response.dto.js';
import { BackofficeRateLimit } from '../auth/backoffice-rate-limit.decorator.js';
import { BackofficeRateLimitGuard } from '../auth/backoffice-rate-limit.guard.js';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { BackofficeOrderIdParamsDto, CompletePickupDto } from './fulfillment.dto.js';
import { BackofficeOrderDetailResponse } from './fulfillment-response.dto.js';
import { PickupCompletionService } from './pickup-completion.service.js';

const PICKUP_COMPLETION_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description:
      'INVALID_STATE_TRANSITION, RESERVATION_EXPIRED, INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION',
  },
  { status: 422 as const, description: 'ORDER_NOT_FULLY_PAID' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-orders')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/orders')
export class PickupCompletionController {
  public constructor(
    @Inject(PickupCompletionService) private readonly commands: PickupCompletionService,
  ) {}

  @Post(':id/complete-pickup')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'completePickup' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CompletePickupDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...PICKUP_COMPLETION_ERRORS)
  public completePickup(
    @Param() params: BackofficeOrderIdParamsDto,
    @Body() input: CompletePickupDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.completePickup(params.id, input, auth, request);
  }
}
