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
import { BackofficeOrderIdParamsDto, ExtendPickupHoldDto } from './fulfillment.dto.js';
import { BackofficeOrderDetailResponse } from './fulfillment-response.dto.js';
import { PickupPreparationService } from './pickup-preparation.service.js';

const PICKUP_PREPARATION_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description:
      'INVALID_STATE_TRANSITION, RESERVATION_EXPIRED, INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION',
  },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-orders')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/orders')
export class PickupPreparationController {
  public constructor(
    @Inject(PickupPreparationService) private readonly commands: PickupPreparationService,
  ) {}

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'confirmPickupOrder' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...PICKUP_PREPARATION_ERRORS)
  public confirm(
    @Param() params: BackofficeOrderIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.confirm(params.id, auth, request);
  }

  @Post(':id/start-preparing')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'startPreparingOrder' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...PICKUP_PREPARATION_ERRORS)
  public startPreparing(
    @Param() params: BackofficeOrderIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.startPreparing(params.id, auth, request);
  }

  @Post(':id/mark-pickup-ready')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'markPickupReady' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...PICKUP_PREPARATION_ERRORS)
  public markPickupReady(
    @Param() params: BackofficeOrderIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.markPickupReady(params.id, auth, request);
  }

  @Post(':id/extend-pickup-hold')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'extendPickupHold' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: ExtendPickupHoldDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...PICKUP_PREPARATION_ERRORS)
  public extendPickupHold(
    @Param() params: BackofficeOrderIdParamsDto,
    @Body() input: ExtendPickupHoldDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.commands.extendPickupHold(params.id, input, auth, request);
  }
}
