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
import {
  MarkShipmentDeliveredDto,
  MarkShipmentFailedDto,
  MarkShipmentReturnedDto,
  ShipmentIdParamsDto,
} from './fulfillment.dto.js';
import { BackofficeOrderDetailResponse } from './fulfillment-response.dto.js';
import { ShipmentFinalizationService } from './shipment-finalization.service.js';
import { ShipmentPreparationService } from './shipment-preparation.service.js';

const SHIPMENT_COMMAND_ERRORS = [
  { status: 400 as const, description: 'VALIDATION_FAILED or MALFORMED_JSON' },
  { status: 401 as const, description: 'AUTH_REQUIRED, ACCESS_TOKEN_INVALID or SESSION_REVOKED' },
  { status: 403 as const, description: 'FORBIDDEN' },
  { status: 404 as const, description: 'RESOURCE_NOT_FOUND' },
  {
    status: 409 as const,
    description:
      'DUPLICATE_RESOURCE, INVALID_STATE_TRANSITION, INVENTORY_NOT_AVAILABLE or CONCURRENT_MODIFICATION',
  },
  { status: 422 as const, description: 'ORDER_NOT_FULLY_PAID' },
  { status: 429 as const, description: 'RATE_LIMITED' },
  { status: 500 as const, description: 'INTERNAL_ERROR' },
];

@ApiTags('backoffice-shipments')
@ApiBearerAuth('access-token')
@Roles('EMPLOYEE', 'ADMIN')
@UseGuards(SessionGuard, RolesGuard, BackofficeRateLimitGuard)
@Controller('backoffice/shipments')
export class BackofficeShipmentController {
  public constructor(
    @Inject(ShipmentPreparationService)
    private readonly preparation: ShipmentPreparationService,
    @Inject(ShipmentFinalizationService)
    private readonly finalization: ShipmentFinalizationService,
  ) {}

  @Post(':id/hand-over')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'handOverShipment' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...SHIPMENT_COMMAND_ERRORS)
  public handOver(
    @Param() params: ShipmentIdParamsDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.preparation.handOver(params.id, auth, request);
  }

  @Post(':id/mark-delivered')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'markShipmentDelivered' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: MarkShipmentDeliveredDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...SHIPMENT_COMMAND_ERRORS)
  public markDelivered(
    @Param() params: ShipmentIdParamsDto,
    @Body() input: MarkShipmentDeliveredDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.finalization.markDelivered(params.id, input, auth, request);
  }

  @Post(':id/mark-failed')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'markShipmentFailed' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: MarkShipmentFailedDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...SHIPMENT_COMMAND_ERRORS)
  public markFailed(
    @Param() params: ShipmentIdParamsDto,
    @Body() input: MarkShipmentFailedDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.finalization.markFailed(params.id, input, auth, request);
  }

  @Post(':id/mark-returned')
  @HttpCode(HttpStatus.OK)
  @BackofficeRateLimit('mutation')
  @ApiOperation({ operationId: 'markShipmentReturned' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: MarkShipmentReturnedDto })
  @ApiOkResponse({ type: BackofficeOrderDetailResponse })
  @ApiErrorResponses(...SHIPMENT_COMMAND_ERRORS)
  public markReturned(
    @Param() params: ShipmentIdParamsDto,
    @Body() input: MarkShipmentReturnedDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.finalization.markReturned(params.id, input, auth, request);
  }
}
